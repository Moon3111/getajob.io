import { ingestJobListings } from "@/lib/ingest-jobs";
import type { IngestResult, ScraperJobInput } from "@/lib/types";
import { fetchGovVacancies } from "./gov-jobs";
import { isPythonScraperAvailable, runPythonScraper } from "./python-runner";

export interface ScrapeForProfileResult extends IngestResult {
  scraped: number;
  keywords: string;
  usedPython: boolean;
  warnings: string[];
}

function dedupeJobs(jobs: ScraperJobInput[]): ScraperJobInput[] {
  const seen = new Set<string>();
  const out: ScraperJobInput[] = [];
  for (const job of jobs) {
    const key = `${job.title.toLowerCase()}|${job.company.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(job);
  }
  return out;
}

/**
 * Scrape HK job boards for keywords, embed with NVIDIA, store in Supabase.
 * Uses Python Playwright when available; always includes gov JSON feed.
 */
export async function scrapeAndIngestForKeywords(
  keywords: string,
  options?: { maxPerSource?: number }
): Promise<ScrapeForProfileResult> {
  const trimmed = keywords.trim();
  if (!trimmed) {
    return {
      inserted: 0,
      duplicates: 0,
      errors: ["Keywords are required"],
      scraped: 0,
      keywords: "",
      usedPython: false,
      warnings: [],
    };
  }

  const maxPerSource = options?.maxPerSource ?? Number(process.env.SCRAPER_MAX_PER_SOURCE ?? 5);
  const warnings: string[] = [];
  let collected: ScraperJobInput[] = [];

  collected.push(...(await fetchGovVacancies(trimmed, maxPerSource)));

  const usePython =
    process.env.SCRAPER_ENABLED !== "false" && isPythonScraperAvailable();

  if (usePython) {
    const { jobs, errors } = await runPythonScraper({
      keywords: trimmed,
      maxPerSource,
    });
    collected.push(...jobs);
    warnings.push(...errors);
  } else if (process.env.NODE_ENV === "production") {
    warnings.push(
      "Live browser scraping runs on your machine or a worker with Python. Government jobs were still loaded."
    );
  }

  collected = dedupeJobs(collected);

  if (collected.length === 0) {
    return {
      inserted: 0,
      duplicates: 0,
      errors: warnings.length ? warnings : ["No jobs found for these keywords"],
      scraped: 0,
      keywords: trimmed,
      usedPython: usePython,
      warnings,
    };
  }

  const ingest = await ingestJobListings(collected);

  return {
    ...ingest,
    scraped: collected.length,
    keywords: trimmed,
    usedPython: usePython,
    warnings,
  };
}
