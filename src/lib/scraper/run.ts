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

export interface ScrapeOptions {
  /** Fewer sources, shorter timeout — use during resume upload */
  quick?: boolean;
  maxPerSource?: number;
  maxTotal?: number;
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
 */
export async function scrapeAndIngestForKeywords(
  keywords: string,
  options?: ScrapeOptions
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

  const quick = options?.quick ?? false;
  const maxPerSource =
    options?.maxPerSource ??
    (quick ? 2 : Number(process.env.SCRAPER_MAX_PER_SOURCE ?? 5));
  const maxTotal =
    options?.maxTotal ?? (quick ? 8 : Number(process.env.SCRAPER_MAX_TOTAL ?? 30));
  const pythonTimeoutMs = quick ? 70_000 : 240_000;
  const uploadSources =
    process.env.SCRAPER_UPLOAD_SOURCES ?? "jobs_gov,indeed,jobsdb";
  const fullSources = process.env.SCRAPER_SOURCES ?? uploadSources;

  const warnings: string[] = [];
  let collected: ScraperJobInput[] = [];

  try {
    collected.push(
      ...(await fetchGovVacancies(trimmed, quick ? 3 : maxPerSource))
    );
  } catch (err) {
    warnings.push(
      `Government feed: ${err instanceof Error ? err.message : "unavailable"}`
    );
  }

  const pythonAvailable =
    process.env.SCRAPER_ENABLED !== "false" && isPythonScraperAvailable();
  const usePython = pythonAvailable && !quick;

  if (usePython) {
    const { jobs, errors } = await runPythonScraper({
      keywords: trimmed,
      maxPerSource,
      sources: fullSources,
      timeoutMs: pythonTimeoutMs,
    });
    collected.push(...jobs);
    if (errors.length) warnings.push(...errors);
  } else if (quick) {
    warnings.push(
      "Loaded government vacancies first. Use Scrape & match on the dashboard for Indeed, JobsDB, and agencies (runs in the background)."
    );
  } else if (!pythonAvailable) {
    warnings.push(
      "Python scraper not found. Install scraper/.venv for Indeed and JobsDB."
    );
  }

  collected = dedupeJobs(collected).slice(0, maxTotal);

  if (collected.length === 0) {
    return {
      inserted: 0,
      duplicates: 0,
      errors:
        warnings.length > 0
          ? warnings
          : ["No jobs found for these keywords. Try different keywords."],
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
