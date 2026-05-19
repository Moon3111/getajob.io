import { NextRequest, NextResponse } from "next/server";
import { triggerApifyActorRunAsync } from "@/lib/apify";

export const runtime = "nodejs";
/** Cron only triggers the run; ingestion happens in the webhook handler. */
export const maxDuration = 10;

function authorizeCron(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const headerSecret = request.headers.get("x-cron-secret");
  const authHeader = request.headers.get("authorization");
  return headerSecret === secret || authHeader === `Bearer ${secret}`;
}

export async function POST(request: NextRequest) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const apifyInput = process.env.APIFY_ACTOR_INPUT
      ? (JSON.parse(process.env.APIFY_ACTOR_INPUT) as Record<string, unknown>)
      : {
          keywords: process.env.APIFY_SEARCH_KEYWORDS ?? "software engineer",
          location: process.env.APIFY_SEARCH_LOCATION ?? "Australia",
          maxItems: Number(process.env.APIFY_MAX_ITEMS ?? 50),
        };

    console.log("[fetch-jobs] Triggering async Apify actor (webhook on success)…");
    const { runId, status } = await triggerApifyActorRunAsync(apifyInput);

    console.log(`[fetch-jobs] Run ${runId} started with status ${status}`);

    return NextResponse.json({
      message: "Apify run started; ingestion will run via webhook on success",
      runId,
      status,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Fetch failed";
    console.error("[fetch-jobs]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
