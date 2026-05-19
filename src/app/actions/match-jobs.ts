"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import {
  distanceToMatchPercent,
  embedText,
  profileToEmbeddingText,
} from "@/lib/nvidia";
import type { MatchedJob, ParsedResume } from "@/lib/types";

export async function getDashboardContext(): Promise<{
  isAuthenticated: boolean;
  profile: ParsedResume | null;
  error?: string;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { isAuthenticated: false, profile: null };
  }

  const { profile, error } = await getUserProfile();
  return { isAuthenticated: true, profile, error };
}

export async function getUserProfile(): Promise<{
  profile: ParsedResume | null;
  error?: string;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { profile: null };
  }

  const { data, error } = await supabase
    .from("user_profiles")
    .select(
      "technical_skills, soft_skills, years_experience, ideal_role"
    )
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return { profile: null, error: error.message };
  }

  if (!data) {
    return { profile: null };
  }

  return {
    profile: {
      technical_skills: data.technical_skills ?? [],
      soft_skills: data.soft_skills ?? [],
      years_experience: Number(data.years_experience) || 0,
      ideal_role: data.ideal_role ?? "Software Engineer",
    },
  };
}

export async function matchJobsForProfile(
  profile?: ParsedResume,
  limit = 20
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
      match_threshold: 0.75,
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
