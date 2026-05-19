"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { embedText } from "@/lib/nvidia";
import { performDeepVerification } from "@/lib/nim-verification";
import { MATCH_THRESHOLD } from "@/lib/matching-config";
import type { MatchedJob, PaginatedJobsResponse, ParsedResume } from "@/lib/types";

const MAX_TOTAL_RESULTS = 30;
const MAX_PAGES = Math.ceil(MAX_TOTAL_RESULTS / 10);

interface HybridMatchRow {
  id: string;
  source: string;
  title: string;
  company: string;
  url: string;
  description: string;
  distance: number;
  match_score: number;
  combined_score?: number;
}

export async function getHybridMatchedJobs(
  page: number = 1,
  limit: number = 10
): Promise<{
  data?: PaginatedJobsResponse;
  error?: string;
}> {
  try {
    // Authenticate user
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { error: "Unauthorized" };
    }

    // Validate pagination params
    const validPage = Math.max(1, Math.min(page, MAX_PAGES));
    const validLimit = Math.min(Math.max(1, limit), 10);
    const offset = (validPage - 1) * validLimit;

    // Load user profile with both AI keywords and manual keywords
    // Note: manual_top_keywords might not exist if migration hasn't been applied
    let profile: any = null;
    
    // Try to load with the new manual_top_keywords column
    const { data: profileWithKeywords, error: errorWithKeywords } = await supabase
      .from("user_profiles")
      .select("technical_skills, soft_skills, years_experience, ideal_role, manual_top_keywords")
      .eq("user_id", user.id)
      .maybeSingle();

    // If the column doesn't exist, try without it
    if (errorWithKeywords?.message?.includes("manual_top_keywords")) {
      const { data: profileWithoutKeywords, error: errorWithoutKeywords } = await supabase
        .from("user_profiles")
        .select("technical_skills, soft_skills, years_experience, ideal_role")
        .eq("user_id", user.id)
        .maybeSingle();
      
      if (errorWithoutKeywords) {
        return { error: `Profile load failed: ${errorWithoutKeywords.message}` };
      }
      
      profile = profileWithoutKeywords ? { ...profileWithoutKeywords, manual_top_keywords: [] } : null;
    } else if (errorWithKeywords) {
      return { error: `Profile load failed: ${errorWithKeywords.message}` };
    } else {
      profile = profileWithKeywords;
    }

    if (!profile) {
      return { error: "No profile found. Upload a resume first." };
    }

    // Prepare keyword arrays
    const cvKeywords = profile.technical_skills || [];
    const manualKeywords = (profile.manual_top_keywords || []).slice(0, 5);

    if (cvKeywords.length === 0 && manualKeywords.length === 0) {
      return {
        data: {
          jobs: [],
          pagination: {
            currentPage: validPage,
            totalPages: 0,
            totalResults: 0,
            hasNextPage: false,
            hasPrevPage: false,
          },
        },
      };
    }

    // Embed keywords using NVIDIA
    let cvEmbeddings: number[][] = [];
    let manualEmbeddings: number[][] = [];

    try {
      // Embed CV keywords
      if (cvKeywords.length > 0) {
        const cvText = cvKeywords.join(", ");
        const cvEmbed = await embedText(cvText);
        cvEmbeddings = [cvEmbed];
      }

      // Embed manual keywords
      if (manualKeywords.length > 0) {
        const manualText = manualKeywords.join(", ");
        const manualEmbed = await embedText(manualText);
        manualEmbeddings = [manualEmbed];
      }
    } catch (embedErr) {
      const message = embedErr instanceof Error ? embedErr.message : "Embedding failed";
      return { error: `Failed to embed keywords: ${message}` };
    }

    // Call hybrid matching RPC
    const serviceClient = createServiceClient();

    let results: HybridMatchRow[] | null = null;
    let rpcError: any = null;

    // Try the new hybrid function first
    const hybridResult = await serviceClient.rpc("match_jobs_hybrid", {
      cv_keywords_embeddings: cvEmbeddings.length > 0 ? cvEmbeddings : [Array(1024).fill(0)],
      manual_keywords_embeddings: manualEmbeddings.length > 0 ? manualEmbeddings : [],
      match_threshold: MATCH_THRESHOLD,
      limit_count: MAX_TOTAL_RESULTS,
      offset_count: 0,
      p_user_id: user.id,
    });

    // Check if the function doesn't exist and fall back
    if (
      hybridResult.error?.message?.includes("Could not find the function") ||
      hybridResult.error?.message?.includes("match_jobs_hybrid")
    ) {
      console.log("Hybrid function not found, falling back to basic matching...");

      // Use CV embeddings only with the original match_jobs function
      if (cvEmbeddings.length > 0) {
        const fallbackResult = await serviceClient.rpc("match_jobs", {
          query_embedding: cvEmbeddings[0],
          match_threshold: MATCH_THRESHOLD,
          match_count: MAX_TOTAL_RESULTS,
          p_user_id: user.id,
        });

        results = fallbackResult.data as any;
        rpcError = fallbackResult.error;
      } else {
        rpcError = new Error("No keywords to match");
      }
    } else {
      results = hybridResult.data as HybridMatchRow[];
      rpcError = hybridResult.error;
    }

    if (rpcError) {
      console.error("RPC error:", rpcError);
      return { error: `Matching failed: ${rpcError.message || String(rpcError)}` };
    }

    if (!results || results.length === 0) {
      return {
        data: {
          jobs: [],
          pagination: {
            currentPage: validPage,
            totalPages: 0,
            totalResults: 0,
            hasNextPage: false,
            hasPrevPage: false,
          },
        },
      };
    }

    // Calculate total pages based on actual results
    const totalResults = Math.min(results.length, MAX_TOTAL_RESULTS);
    const totalPages = Math.ceil(totalResults / validLimit);

    // Slice results for current page
    const pageResults = results.slice(offset, offset + validLimit) as HybridMatchRow[];

    // Transform to MatchedJob format
    const jobs: MatchedJob[] = pageResults.map((row) => ({
      id: row.id,
      source: row.source,
      title: row.title,
      company: row.company,
      url: row.url,
      description: row.description || "",
      similarity: row.match_score || row.distance || 0,
      match_percent: Math.round(((row.match_score || row.distance || 0) * 100) || 0),
    }));

    // Perform deep LLM verification on the current page's jobs
    try {
      const verificationJobs = jobs.map((job) => ({
        job_id: job.id,
        title: job.title,
        company: job.company,
        description: job.description ?? "",
      }));

      const parsedProfile: ParsedResume = {
        technical_skills: profile.technical_skills || [],
        soft_skills: profile.soft_skills || [],
        years_experience: Number(profile.years_experience) || 0,
        ideal_role: profile.ideal_role || "Software Engineer",
      };

      const analysisMap = await performDeepVerification(
        verificationJobs,
        parsedProfile,
        manualKeywords
      );

      // Enrich jobs with AI analysis data
      jobs.forEach((job) => {
        const analysis = analysisMap.get(job.id);
        if (analysis) {
          job.ai_analysis = analysis;
        }
      });
    } catch (verifyErr) {
      // Non-blocking: Log but don't fail the entire request
      const message = verifyErr instanceof Error ? verifyErr.message : "Verification failed";
      console.error("Deep verification error:", message);
      // Jobs still return with vector scores even if LLM verification fails
    }

    return {
      data: {
        jobs,
        pagination: {
          currentPage: validPage,
          totalPages,
          totalResults,
          hasNextPage: validPage < totalPages,
          hasPrevPage: validPage > 1,
        },
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch matched jobs";
    return { error: message };
  }
}
