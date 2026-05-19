import type {
  ApifyRunStartResponse,
  ApifyWebhookConfig,
  ApifyWebhookPayload,
} from "@/lib/apify-types";
import type { ScraperJobInput } from "@/lib/types";

const APIFY_BASE = "https://api.apify.com/v2";

function getToken(): string {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) throw new Error("APIFY_API_TOKEN is not configured");
  return token;
}

function getActorId(): string {
  return process.env.APIFY_ACTOR_ID ?? "bebity/linkedin-jobs-scraper";
}

export function getAppBaseUrl(): string {
  const explicit =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.APP_URL ??
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : undefined);

  if (!explicit) {
    throw new Error(
      "Set NEXT_PUBLIC_APP_URL or deploy on Vercel (VERCEL_URL) for Apify webhooks"
    );
  }
  return explicit.replace(/\/$/, "");
}

export function buildApifyWebhookUrl(): string {
  const secret = process.env.APIFY_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("APIFY_WEBHOOK_SECRET is not configured");
  }
  const base = getAppBaseUrl();
  return `${base}/api/webhooks/apify?secret=${encodeURIComponent(secret)}`;
}

export function verifyApifyWebhookSecret(request: Request): boolean {
  const secret = process.env.APIFY_WEBHOOK_SECRET;
  if (!secret) return false;

  const url = new URL(request.url);
  const querySecret = url.searchParams.get("secret");
  const headerSecret = request.headers.get("x-apify-webhook-secret");

  return querySecret === secret || headerSecret === secret;
}

/**
 * Starts an Apify Actor run without blocking on completion.
 * Registers a webhook for ACTOR.RUN.SUCCEEDED → /api/webhooks/apify
 */
export async function triggerApifyActorRunAsync(
  input: Record<string, unknown> = {}
): Promise<{ runId: string; status: string }> {
  const token = getToken();
  const actorId = encodeURIComponent(getActorId().replace("/", "~"));
  const webhookUrl = buildApifyWebhookUrl();

  const webhooks: ApifyWebhookConfig[] = [
    {
      eventTypes: ["ACTOR.RUN.SUCCEEDED"],
      requestUrl: webhookUrl,
      payloadTemplate: `{"eventType":"{{eventType}}","resource":{{resource}}}`,
      headersTemplate: `{"Content-Type":"application/json","x-apify-webhook-secret":"${process.env.APIFY_WEBHOOK_SECRET}"}`,
    },
  ];

  const runRes = await fetch(
    `${APIFY_BASE}/acts/${actorId}/runs?token=${token}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...input, webhooks }),
    }
  );

  if (!runRes.ok) {
    throw new Error(`Apify run start failed: ${await runRes.text()}`);
  }

  const run = (await runRes.json()) as ApifyRunStartResponse;
  const runId = run.data?.id;
  if (!runId) throw new Error("Apify did not return a run id");

  return {
    runId,
    status: run.data?.status ?? "RUNNING",
  };
}

export function extractDatasetIdFromWebhook(
  payload: ApifyWebhookPayload
): string | null {
  return payload.resource?.defaultDatasetId ?? null;
}

/** Download and normalize scraped items from an Apify dataset. */
export async function fetchApifyDatasetItems(
  datasetId: string
): Promise<ScraperJobInput[]> {
  const token = getToken();
  const itemsRes = await fetch(
    `${APIFY_BASE}/datasets/${datasetId}/items?token=${token}&format=json`
  );

  if (!itemsRes.ok) {
    throw new Error(`Apify dataset fetch failed: ${await itemsRes.text()}`);
  }

  const items = (await itemsRes.json()) as Record<string, unknown>[];
  return items.map(mapApifyItemToJob).filter((j): j is ScraperJobInput => j !== null);
}

export function mapApifyItemToJob(
  item: Record<string, unknown>
): ScraperJobInput | null {
  const title =
    (item.title as string) ??
    (item.jobTitle as string) ??
    (item.position as string);
  const company =
    (item.company as string) ??
    (item.companyName as string) ??
    (item.organization as string);
  const description =
    (item.description as string) ??
    (item.jobDescription as string) ??
    (item.text as string) ??
    "";
  const url =
    (item.url as string) ??
    (item.link as string) ??
    (item.jobUrl as string) ??
    "";

  if (!title || !company) return null;

  return {
    title: String(title),
    company: String(company),
    description: String(description || `${title} at ${company}`),
    url: String(url),
    source: "apify",
  };
}
