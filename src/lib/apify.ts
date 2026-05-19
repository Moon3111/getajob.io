import type { ScraperJobInput } from "@/lib/types";

const APIFY_BASE = "https://api.apify.com/v2";

function getToken(): string {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) throw new Error("APIFY_API_TOKEN is not configured");
  return token;
}

function getActorId(): string {
  return (
    process.env.APIFY_ACTOR_ID ??
    "bebity/linkedin-jobs-scraper"
  );
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function runApifyJobScraper(
  input: Record<string, unknown> = {}
): Promise<ScraperJobInput[]> {
  const token = getToken();
  const actorId = encodeURIComponent(getActorId().replace("/", "~"));

  const runRes = await fetch(
    `${APIFY_BASE}/acts/${actorId}/runs?token=${token}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }
  );

  if (!runRes.ok) {
    throw new Error(`Apify run start failed: ${await runRes.text()}`);
  }

  const run = await runRes.json();
  const runId = run.data?.id;
  if (!runId) throw new Error("Apify did not return a run id");

  const deadline = Date.now() + 10 * 60 * 1000;
  let status = "RUNNING";
  let datasetId: string | undefined = run.data?.defaultDatasetId;

  while (status === "RUNNING" || status === "READY") {
    if (Date.now() > deadline) {
      throw new Error("Apify run timed out after 10 minutes");
    }
    await sleep(5_000);

    const statusRes = await fetch(
      `${APIFY_BASE}/actor-runs/${runId}?token=${token}`
    );
    const statusBody = await statusRes.json();
    status = statusBody.data?.status;
    datasetId = statusBody.data?.defaultDatasetId ?? datasetId;

    if (status === "FAILED" || status === "ABORTED") {
      throw new Error(`Apify run ${status}`);
    }
  }

  if (!datasetId) {
    throw new Error("Apify run completed without a dataset id");
  }
  const itemsRes = await fetch(
    `${APIFY_BASE}/datasets/${datasetId}/items?token=${token}&format=json`
  );

  if (!itemsRes.ok) {
    throw new Error(`Apify dataset fetch failed: ${await itemsRes.text()}`);
  }

  const items: Record<string, unknown>[] = await itemsRes.json();
  return items.map(mapApifyItemToJob).filter(Boolean) as ScraperJobInput[];
}

function mapApifyItemToJob(
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
