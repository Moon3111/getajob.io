"use server";

import { revalidatePath } from "next/cache";
import { scrapeAndIngestForKeywords } from "@/lib/scraper/run";
import { createClient } from "@/lib/supabase/server";
import { matchJobsForProfile } from "@/app/actions/match-jobs";

export async function scrapeAndMatchWithKeywords(
  keywords: string
): Promise<{
  ok: boolean;
  inserted?: number;
  matchCount?: number;
  error?: string;
  warnings?: string[];
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "Sign in required" };
  }

  const trimmed = keywords.trim();
  if (!trimmed) {
    return { ok: false, error: "Enter job search keywords" };
  }

  await supabase
    .from("user_profiles")
    .update({
      job_search_keywords: trimmed,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id);

  const scrape = await scrapeAndIngestForKeywords(trimmed);

  await supabase
    .from("user_profiles")
    .update({ last_scrape_at: new Date().toISOString() })
    .eq("user_id", user.id);

  if (scrape.errors.length && scrape.inserted === 0) {
    return {
      ok: false,
      error: scrape.errors.join("; "),
      warnings: scrape.warnings,
    };
  }

  const { jobs } = await matchJobsForProfile();
  revalidatePath("/dashboard");

  return {
    ok: true,
    inserted: scrape.inserted,
    matchCount: jobs.length,
    warnings: scrape.warnings,
  };
}
