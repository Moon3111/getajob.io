import { NextRequest, NextResponse } from "next/server";
import { runApifyJobScraper } from "@/lib/apify";
import { ingestJobListings } from "@/lib/ingest-jobs";

export const runtime = "nodejs";
export const maxDuration = 300;

function authorizeCron(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const headerSecret = request.headers.get("x-cron-secret");
  const authHeader = request.headers.get("authorization");
  return (
    headerSecret === secret || authHeader === `Bearer ${secret}`
  );
}

export async function POST(request: NextRequest) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const apifyInput = process.env.APIFY_ACTOR_INPUT
      ? JSON.parse(process.env.APIFY_ACTOR_INPUT)
      : {
          keywords: process.env.APIFY_SEARCH_KEYWORDS ?? "software engineer",
          location: process.env.APIFY_SEARCH_LOCATION ?? "Australia",
          maxItems: Number(process.env.APIFY_MAX_ITEMS ?? 50),
        };

    console.log("[fetch-jobs] Starting Apify actor run…");
    const jobs = await runApifyJobScraper(apifyInput);
    console.log(`[fetch-jobs] Fetched ${jobs.length} raw listings from Apify`);

    const result = await ingestJobListings(jobs);
    console.log(
      `[fetch-jobs] Inserted: ${result.inserted}, Duplicates: ${result.duplicates}, Errors: ${result.errors.length}`
    );

    if (result.errors.length > 0) {
      console.warn("[fetch-jobs] Errors:", result.errors.slice(0, 10));
    }

    return NextResponse.json({
      fetched: jobs.length,
      ...result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Fetch failed";
    console.error("[fetch-jobs]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
