"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import {
  distanceToMatchPercent,
  embedText,
  profileToEmbeddingText,
} from "@/lib/nvidia";
import { MATCH_LIMIT, MATCH_THRESHOLD } from "@/lib/matching-config";
import type { MatchedJob, ParsedResume } from "@/lib/types";

export type MatchStatus = "saved" | "dismissed" | "applied";

export async function getDashboardContext(): Promise<{
  isAuthenticated: boolean;
  profile: ParsedResume | null;
  jobSearchKeywords: string | null;
  error?: string;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { isAuthenticated: false, profile: null, jobSearchKeywords: null };
  }

  const { profile, jobSearchKeywords, error } = await getUserProfile();
  return {
    isAuthenticated: true,
    profile,
    jobSearchKeywords,
    error,
  };
}

export async function getUserProfile(): Promise<{
  profile: ParsedResume | null;
  jobSearchKeywords: string | null;
  error?: string;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { profile: null, jobSearchKeywords: null };
  }

  const { data, error } = await supabase
    .from("user_profiles")
    .select(
      "technical_skills, soft_skills, years_experience, ideal_role, username, job_search_keywords"
    )
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return { profile: null, jobSearchKeywords: null, error: error.message };
  }

  if (!data) {
    return { profile: null, jobSearchKeywords: null };
  }

  return {
    profile: {
      technical_skills: data.technical_skills ?? [],
      soft_skills: data.soft_skills ?? [],
      years_experience: Number(data.years_experience) || 0,
      ideal_role: data.ideal_role ?? "Software Engineer",
    },
    jobSearchKeywords: data.job_search_keywords ?? null,
  };
}

export async function getJobsByMatchStatus(
  status: MatchStatus
): Promise<{ jobs: MatchedJob[]; error?: string }> {
  const supabaseAuth = await createClient();
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();

  if (!user) {
    return { jobs: [], error: "Sign in required" };
  }

  const { data, error } = await supabaseAuth
    .from("matches")
    .select(
      "score, jobs(id, source, title, company, url, description)"
    )
    .eq("user_id", user.id)
    .eq("status", status)
    .order("created_at", { ascending: false });

  if (error) {
    return { jobs: [], error: error.message };
  }

  const jobs: MatchedJob[] = [];

  for (const row of data ?? []) {
    const raw = row.jobs;
    const job = (Array.isArray(raw) ? raw[0] : raw) as {
      id: string;
      source: string;
      title: string;
      company: string;
      url: string;
      description?: string;
    } | null;

    if (!job?.id) continue;

    const score = Number(row.score) || 0;
    jobs.push({
      id: job.id,
      source: job.source,
      title: job.title,
      company: job.company,
      url: job.url,
      description: job.description,
      similarity: score,
      match_percent: Math.round(score * 100),
    });
  }

  return { jobs };
}

export async function matchJobsForProfile(
  profile?: ParsedResume,
  limit = MATCH_LIMIT
): Promise<{ jobs: MatchedJob[]; error?: string }> {
  try {
    const supabaseAuth = await createClient();
    const {
      data: { user },
    } = await supabaseAuth.auth.getUser();

    let resolvedProfile = profile;
    if (!resolvedProfile && user) {
      const loaded = await getUserProfile();
      resolvedProfile = loaded.profile ?? undefined;
    }

    if (!resolvedProfile) {
      return { jobs: [], error: "No profile found. Upload a resume first." };
    }

    const summary = profileToEmbeddingText(resolvedProfile);
    const queryEmbedding = await embedText(summary);

    const supabase = createServiceClient();
    const { data, error } = await supabase.rpc("match_jobs", {
      query_embedding: queryEmbedding,
      match_threshold: MATCH_THRESHOLD,
      match_count: limit,
      p_user_id: user?.id ?? null,
    });

    if (error) {
      return { jobs: [], error: error.message };
    }

    const jobs: MatchedJob[] = (data ?? []).map(
      (row: {
        id: string;
        source: string;
        title: string;
        company: string;
        url: string;
        description: string;
        distance: number;
        match_score?: number;
      }) => ({
        id: row.id,
        source: row.source,
        title: row.title,
        company: row.company,
        url: row.url,
        description: row.description,
        similarity: row.match_score ?? 1 - row.distance,
        match_percent:
          row.match_score != null
            ? Math.round(row.match_score * 100)
            : distanceToMatchPercent(row.distance),
      })
    );

    return { jobs };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Matching failed";
    return { jobs: [], error: message };
  }
}
