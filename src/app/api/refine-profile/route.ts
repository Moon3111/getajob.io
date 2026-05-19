import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import {
  embedText,
  extractKeywordsFromJobs,
  profileToEmbeddingText,
} from "@/lib/nvidia";
import type { ParsedResume } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = createServiceClient();

  const { data: savedMatches, error: matchError } = await service
    .from("matches")
    .select("job_id, jobs(description, title, company)")
    .eq("user_id", user.id)
    .eq("status", "saved");

  if (matchError) {
    return NextResponse.json({ error: matchError.message }, { status: 500 });
  }

  const descriptions =
    savedMatches
      ?.map((m) => {
        const job = m.jobs as
          | { description?: string; title?: string; company?: string }
          | null;
        return job?.description ?? `${job?.title} at ${job?.company}`;
      })
      .filter(Boolean) ?? [];

  if (descriptions.length === 0) {
    return NextResponse.json(
      { error: "Save at least one job before refining your profile" },
      { status: 400 }
    );
  }

  const keywords = await extractKeywordsFromJobs(descriptions as string[]);

  const { data: existing } = await supabase
    .from("user_profiles")
    .select("technical_skills, soft_skills, years_experience, ideal_role")
    .eq("user_id", user.id)
    .maybeSingle();

  const profile: ParsedResume = {
    technical_skills: Array.from(
      new Set([...(existing?.technical_skills ?? []), ...keywords])
    ).slice(0, 40),
    soft_skills: existing?.soft_skills ?? [],
    years_experience: Number(existing?.years_experience) || 0,
    ideal_role: existing?.ideal_role ?? "Software Engineer",
  };

  const embeddingText =
    profileToEmbeddingText(profile) +
    (keywords.length ? `\nPreferred themes: ${keywords.join(", ")}` : "");

  await embedText(embeddingText);

  const { error: updateError } = await supabase.from("user_profiles").upsert(
    {
      user_id: user.id,
      technical_skills: profile.technical_skills,
      soft_skills: profile.soft_skills,
      years_experience: profile.years_experience,
      ideal_role: profile.ideal_role,
      skills: { technical: profile.technical_skills, refined_keywords: keywords },
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({
    profile,
    keywordsAdded: keywords,
  });
}
