/**
 * Apify actor registry for Hong Kong job sources.
 * Set actor IDs in env after creating an Apify account: https://console.apify.com
 */
export interface JobSourceConfig {
  id: string;
  name: string;
  envActorKey: string;
  defaultActorId?: string;
}

export const HK_JOB_SOURCES: JobSourceConfig[] = [
  {
    id: "linkedin",
    name: "LinkedIn",
    envActorKey: "APIFY_ACTOR_LINKEDIN",
    defaultActorId: "bebity/linkedin-jobs-scraper",
  },
  {
    id: "jobsdb",
    name: "JobsDB",
    envActorKey: "APIFY_ACTOR_JOBSDB",
    defaultActorId: "junglee/jobsdb-scraper",
  },
  {
    id: "indeed",
    name: "Indeed",
    envActorKey: "APIFY_ACTOR_INDEED",
    defaultActorId: "misceres/indeed-scraper",
  },
];
// HK government & niche platforms: use Python scraper (scraper/README.md)
// jobs_gov, talent_gov, glassdoor, efinancialcareers, cpjobs, hkslash,
// michael_page, randstad, robert_half, ambition

export function getDefaultApifyInput(): Record<string, unknown> {
  return {
    keywords: process.env.APIFY_SEARCH_KEYWORDS ?? "software engineer",
    location: process.env.APIFY_SEARCH_LOCATION ?? "Hong Kong",
    maxItems: Number(process.env.APIFY_MAX_ITEMS ?? 30),
    country: "HK",
  };
}

export function resolveActorId(source: JobSourceConfig): string | null {
  const fromEnv = process.env[source.envActorKey]?.trim();
  if (fromEnv) return fromEnv;
  return source.defaultActorId ?? null;
}
