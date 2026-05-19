import { NextRequest, NextResponse } from "next/server";
import type { ApifyWebhookPayload } from "@/lib/apify-types";
import {
  extractDatasetIdFromWebhook,
  fetchApifyDatasetItems,
  verifyApifyWebhookSecret,
} from "@/lib/apify";
import { ingestJobListings } from "@/lib/ingest-jobs";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  if (!verifyApifyWebhookSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: ApifyWebhookPayload;
  try {
    payload = (await request.json()) as ApifyWebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const eventType = payload.eventType ?? "";
  if (eventType && !eventType.includes("SUCCEEDED")) {
    return NextResponse.json({ received: true, skipped: eventType });
  }

  const datasetId = extractDatasetIdFromWebhook(payload);
  if (!datasetId) {
    console.error("[Apify Webhook] Missing defaultDatasetId in payload");
    return NextResponse.json(
      { error: "No dataset id in webhook payload" },
      { status: 400 }
    );
  }

  try {
    const jobs = await fetchApifyDatasetItems(datasetId);
    const result = await ingestJobListings(jobs);

    console.log(
      `[Apify Webhook] Total Jobs Received: ${jobs.length} | New Inserted: ${result.inserted} | Duplicates Dropped: ${result.duplicates}`
    );

    if (result.errors.length > 0) {
      console.warn(
        "[Apify Webhook] Ingest errors:",
        result.errors.slice(0, 5)
      );
    }

    return NextResponse.json({
      datasetId,
      received: jobs.length,
      inserted: result.inserted,
      duplicates: result.duplicates,
      errors: result.errors.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Webhook ingest failed";
    console.error("[Apify Webhook]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
