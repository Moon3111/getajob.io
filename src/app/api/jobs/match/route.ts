import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { embedText } from "@/lib/nvidia";
import { performDeepVerification } from "@/lib/nim-verification";
import { MATCH_THRESHOLD } from "@/lib/matching-config";
import type { MatchedJob, PaginatedJobsResponse, ParsedResume } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_TOTAL_RESULTS = 30; // Hard cap: 3 pages × 10 items
const MAX_PAGES = Math.ceil(MAX_TOTAL_RESULTS / DEFAULT_LIMIT);

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

export async function GET(request: NextRequest) {
  try {
    // Parse pagination params
    const searchParams = request.nextUrl.searchParams;
    const pageParam = parseInt(searchParams.get("page") || String(DEFAULT_PAGE), 10);
    const limitParam = parseInt(searchParams.get("limit") || String(DEFAULT_LIMIT), 10);

    // Validate pagination params
    const page = Math.max(1, Math.min(pageParam, MAX_PAGES));
    const limit = Math.min(Math.max(1, limitParam), DEFAULT_LIMIT);
    const offset = (page - 1) * limit;

    // Authenticate user
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Load user profile with both AI keywords and manual keywords
    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("technical_skills, soft_skills, years_experience, ideal_role, manual_top_keywords")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profileError) {
      return NextResponse.json(
        { error: `Profile load failed: ${profileError.message}` },
        { status: 500 }
      );
    }

    if (!profile) {
      return NextResponse.json(
        { error: "No profile found. Upload a resume first." },
        { status: 400 }
      );
    }

    // Prepare keyword arrays
    const cvKeywords = profile.technical_skills || [];
    const manualKeywords = (profile.manual_top_keywords || []).slice(0, 5);

    if (cvKeywords.length === 0 && manualKeywords.length === 0) {
      return NextResponse.json(
        {
          jobs: [],
          pagination: {
            currentPage: page,
            totalPages: 0,
            totalResults: 0,
            hasNextPage: false,
            hasPrevPage: false,
          },
        } as PaginatedJobsResponse
      );
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
      return NextResponse.json(
        { error: `Failed to embed keywords: ${message}` },
        { status: 502 }
      );
    }

    // Call hybrid matching RPC
    const serviceClient = createServiceClient();

    try {
      const { data: results, error: rpcError } = await serviceClient.rpc(
        "match_jobs_hybrid",
        {
          cv_keywords_embeddings: cvEmbeddings.length > 0 ? cvEmbeddings : [Array(1024).fill(0)],
          manual_keywords_embeddings: manualEmbeddings.length > 0 ? manualEmbeddings : [],
          match_threshold: MATCH_THRESHOLD,
          limit_count: MAX_TOTAL_RESULTS,
          offset_count: 0,
          p_user_id: user.id,
        }
      );

      if (rpcError) {
        console.error("RPC error:", rpcError);
        return NextResponse.json(
          { error: `Matching failed: ${rpcError.message}` },
          { status: 500 }
        );
      }

      if (!results || results.length === 0) {
        return NextResponse.json(
          {
            jobs: [],
            pagination: {
              currentPage: page,
              totalPages: 0,
              totalResults: 0,
              hasNextPage: false,
              hasPrevPage: false,
            },
          } as PaginatedJobsResponse
        );
      }

      // Calculate total pages based on actual results
      const totalResults = Math.min(results.length, MAX_TOTAL_RESULTS);
      const totalPages = Math.ceil(totalResults / limit);

      // Slice results for current page
      const pageResults = results.slice(offset, offset + limit) as HybridMatchRow[];

      // Transform to MatchedJob format (before AI enrichment)
      const jobs: MatchedJob[] = pageResults.map((row) => ({
        id: row.id,
        source: row.source,
        title: row.title,
        company: row.company,
        url: row.url,
        description: row.description || "",
        similarity: row.match_score,
        match_percent: Math.round((row.match_score || 0) * 100),
      }));

      // Perform deep LLM verification on the current page's jobs
      // This enriches each job with detailed AI analysis
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
        // Log verification errors but don't fail the entire request
        // Jobs will still be returned with vector scores, just without AI analysis
        console.error("Deep verification error (non-fatal):", verifyErr);
      }

      return NextResponse.json({
        jobs,
        pagination: {
          currentPage: page,
          totalPages,
          totalResults,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
        },
      } as PaginatedJobsResponse);
    } catch (rpcErr) {
      const message = rpcErr instanceof Error ? rpcErr.message : "RPC execution failed";
      console.error("RPC execution error:", rpcErr);
      return NextResponse.json(
        { error: `Matching error: ${message}` },
        { status: 500 }
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Unexpected error:", err);
    return NextResponse.json(
      { error: `Server error: ${message}` },
      { status: 500 }
    );
  }
}
