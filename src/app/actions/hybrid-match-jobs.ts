"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { embedQuery, profileToEmbeddingText } from "@/lib/nvidia";
import { formatVectorForPostgres } from "@/lib/pgvector";
import { performDeepVerification } from "@/lib/nim-verification";
import { MATCH_THRESHOLD } from "@/lib/matching-config";
import {
  applyVerificationFilter,
  filterJobsBySeniority,
  mergeAiIntoMatchPercent,
} from "@/lib/matching/filter-jobs";
import { normalizeSeniorityLevel } from "@/lib/jobs/seniority";
import { normalizeProfile } from "@/lib/profile/normalize";
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
  seniority_level?: string | null;
}

interface ProfileRow {
  technical_skills: string[] | null;
  soft_skills: string[] | null;
  years_experience: number | null;
  ideal_role: string | null;
  manual_top_keywords?: string[] | null;
  career_level?: string | null;
  target_seniority?: string | null;
  experience_summary?: string | null;
  graduation_year?: number | null;
  cv_embedding?: string | null;
}

export async function getHybridMatchedJobs(
  page: number = 1,
  limit: number = 10
): Promise<{
  data?: PaginatedJobsResponse;
  error?: string;
}> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { error: "Unauthorized" };
    }

    const validPage = Math.max(1, Math.min(page, MAX_PAGES));
    const validLimit = Math.min(Math.max(1, limit), 10);
    const offset = (validPage - 1) * validLimit;

    const profile = await loadProfile(supabase, user.id);
    if (!profile) {
      return { error: "No profile found. Upload a resume first." };
    }

    const parsed = normalizeProfile({
      technical_skills: profile.technical_skills ?? [],
      soft_skills: profile.soft_skills ?? [],
      years_experience: Number(profile.years_experience) || 0,
      ideal_role: profile.ideal_role ?? "Software Engineer",
      career_level: profile.career_level
        ? normalizeSeniorityLevel(profile.career_level)
        : undefined,
      target_seniority: profile.target_seniority
        ? normalizeSeniorityLevel(profile.target_seniority)
        : undefined,
      experience_summary: profile.experience_summary ?? undefined,
      graduation_year: profile.graduation_year,
    });

    const manualKeywords = (profile.manual_top_keywords ?? []).slice(0, 5);
    const careerLevel = normalizeSeniorityLevel(
      parsed.target_seniority ?? parsed.career_level
    );

    let cvEmbedding: number[] | null = null;
    let manualEmbedding: number[] | null = null;

    try {
      if (profile.cv_embedding) {
        cvEmbedding = parseStoredVector(profile.cv_embedding);
      }
      if (!cvEmbedding) {
        cvEmbedding = await embedQuery(profileToEmbeddingText(parsed));
      }
      if (manualKeywords.length > 0) {
        manualEmbedding = await embedQuery(manualKeywords.join(", "));
      }
    } catch (embedErr) {
      const message =
        embedErr instanceof Error ? embedErr.message : "Embedding failed";
      return { error: `Failed to embed profile: ${message}` };
    }

    const serviceClient = createServiceClient();
    const results = await runMatchRpc(
      serviceClient,
      cvEmbedding,
      manualEmbedding,
      careerLevel,
      user.id
    );

    if (!results || results.length === 0) {
      return {
        data: {
          jobs: [],
          pagination: emptyPagination(validPage),
        },
      };
    }

    const seniorityFiltered = filterJobsBySeniority(results, careerLevel);
    const totalResults = Math.min(seniorityFiltered.length, MAX_TOTAL_RESULTS);
    const totalPages = Math.ceil(totalResults / validLimit);
    const pageResults = seniorityFiltered.slice(offset, offset + validLimit);

    let jobs: MatchedJob[] = pageResults.map((row) => ({
      id: row.id,
      source: row.source,
      title: row.title,
      company: row.company,
      url: row.url,
      description: row.description || "",
      similarity: row.combined_score ?? row.match_score ?? 0,
      match_percent: Math.round(
        ((row.combined_score ?? row.match_score ?? 0) * 100) || 0
      ),
    }));

    try {
      const verificationJobs = jobs.map((job) => ({
        job_id: job.id,
        title: job.title,
        company: job.company,
        description: job.description ?? "",
      }));

      const analysisMap = await performDeepVerification(
        verificationJobs,
        parsed,
        manualKeywords
      );

      jobs = jobs.map((job) =>
        mergeAiIntoMatchPercent(job, analysisMap.get(job.id))
      );
      jobs = applyVerificationFilter(jobs);
    } catch (verifyErr) {
      console.error(
        "Deep verification error:",
        verifyErr instanceof Error ? verifyErr.message : verifyErr
      );
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
    const message =
      err instanceof Error ? err.message : "Failed to fetch matched jobs";
    return { error: message };
  }
}

async function loadProfile(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<ProfileRow | null> {
  const fullSelect =
    "technical_skills, soft_skills, years_experience, ideal_role, manual_top_keywords, career_level, target_seniority, experience_summary, graduation_year, cv_embedding";

  const { data, error } = await supabase
    .from("user_profiles")
    .select(fullSelect)
    .eq("user_id", userId)
    .maybeSingle();

  if (error?.message?.includes("manual_top_keywords")) {
    const fallback = await supabase
      .from("user_profiles")
      .select(
        "technical_skills, soft_skills, years_experience, ideal_role, career_level, target_seniority, experience_summary"
      )
      .eq("user_id", userId)
      .maybeSingle();
    if (fallback.error) return null;
    return fallback.data
      ? { ...fallback.data, manual_top_keywords: [], cv_embedding: null }
      : null;
  }

  if (error || !data) return null;
  return data as ProfileRow;
}

async function runMatchRpc(
  serviceClient: ReturnType<typeof createServiceClient>,
  cvEmbedding: number[],
  manualEmbedding: number[] | null,
  careerLevel: string,
  userId: string
): Promise<HybridMatchRow[]> {
  const cvFormatted = formatVectorForPostgres(cvEmbedding);
  const manualFormatted = manualEmbedding
    ? formatVectorForPostgres(manualEmbedding)
    : null;

  const v2 = await serviceClient.rpc("match_jobs_hybrid_v2", {
    cv_embedding: cvFormatted,
    manual_embedding: manualFormatted,
    p_career_level: careerLevel,
    match_threshold: MATCH_THRESHOLD,
    limit_count: MAX_TOTAL_RESULTS,
    offset_count: 0,
    p_user_id: userId,
  });

  if (!v2.error && v2.data) {
    return v2.data as HybridMatchRow[];
  }

  const hybrid = await serviceClient.rpc("match_jobs_hybrid", {
    cv_embedding: cvFormatted,
    manual_embedding: manualFormatted,
    match_threshold: MATCH_THRESHOLD,
    limit_count: MAX_TOTAL_RESULTS,
    offset_count: 0,
    p_user_id: userId,
  });

  if (!hybrid.error && hybrid.data) {
    return hybrid.data as HybridMatchRow[];
  }

  const fallback = await serviceClient.rpc("match_jobs", {
    query_embedding: cvFormatted,
    match_threshold: MATCH_THRESHOLD,
    match_count: MAX_TOTAL_RESULTS,
    p_user_id: userId,
  });

  if (fallback.error) {
    throw new Error(fallback.error.message);
  }

  return (fallback.data ?? []).map(
    (row: HybridMatchRow & { distance: number }) => ({
      ...row,
      match_score: 1 - row.distance,
      combined_score: 1 - row.distance,
    })
  );
}

function parseStoredVector(stored: string): number[] | null {
  try {
    const trimmed = stored.trim();
    if (trimmed.startsWith("[")) {
      return JSON.parse(trimmed) as number[];
    }
    return null;
  } catch {
    return null;
  }
}

function emptyPagination(validPage: number) {
  return {
    currentPage: validPage,
    totalPages: 0,
    totalResults: 0,
    hasNextPage: false,
    hasPrevPage: false,
  };
}
