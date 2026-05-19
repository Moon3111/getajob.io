"use server";

import { revalidatePath } from "next/cache";
import { matchJobsForProfile } from "@/app/actions/match-jobs";
import { scrapeAndIngestForKeywords } from "@/lib/scraper/run";
import { createClient } from "@/lib/supabase/server";
import { updateUserProfile } from "@/lib/supabase/profile-update";

export async function scrapeAndMatchWithKeywords(
  keywords: string,
  options?: { quick?: boolean }
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

  await updateUserProfile(supabase, user.id, {
    job_search_keywords: trimmed,
  });

  const scrape = await scrapeAndIngestForKeywords(trimmed, {
    quick: options?.quick ?? false,
  });

  await updateUserProfile(supabase, user.id, {
    last_scrape_at: new Date().toISOString(),
  });

  const hasJobs = scrape.inserted > 0 || scrape.duplicates > 0;

  if (!hasJobs && scrape.errors.length > 0) {
    return {
      ok: false,
      error: scrape.errors.slice(0, 3).join("; "),
      warnings: scrape.warnings,
    };
  }

  const { jobs, error: matchError } = await matchJobsForProfile();
  revalidatePath("/dashboard");

  return {
    ok: true,
    inserted: scrape.inserted,
    matchCount: jobs.length,
    warnings: [
      ...scrape.warnings,
      ...(matchError ? [matchError] : []),
      ...(scrape.errors.length ? scrape.errors.slice(0, 2) : []),
    ].filter(Boolean),
  };
}
