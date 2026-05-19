"use server";

import { readFile } from "fs/promises";
import path from "path";
import { ingestJobListings } from "@/lib/ingest-jobs";
import type { IngestResult, ScraperJobInput } from "@/lib/types";

export async function seedHongKongJobs(): Promise<
  IngestResult & { message?: string }
> {
  try {
    const filePath = path.join(process.cwd(), "scripts", "seed-hk-jobs.json");
    const raw = await readFile(filePath, "utf-8");
    const jobs = JSON.parse(raw) as ScraperJobInput[];

    const result = await ingestJobListings(jobs);
    return {
      ...result,
      message: `Processed ${jobs.length} Hong Kong sample listings.`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Seed failed";
    return { inserted: 0, duplicates: 0, errors: [message] };
  }
}
