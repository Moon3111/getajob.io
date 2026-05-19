import type { ScraperJobInput } from "@/lib/types";

const GOV_JSON_URL =
  "https://www.csb.gov.hk/datagovhk/gov-vacancies/gov-job-vacancies-en.json";

function keywordMatch(text: string, keywords: string): boolean {
  const hay = text.toLowerCase();
  const tokens = keywords
    .toLowerCase()
    .split(/[,+\s]+/)
    .filter((t) => t.length >= 3);
  if (tokens.length === 0) return true;
  return tokens.some((t) => hay.includes(t));
}

/** Hong Kong government vacancies (works on Vercel without Playwright). */
export async function fetchGovVacancies(
  keywords: string,
  maxJobs: number
): Promise<ScraperJobInput[]> {
  const res = await fetch(GOV_JSON_URL, { next: { revalidate: 3600 } });
  if (!res.ok) return [];

  const data = (await res.json()) as {
    common?: { vacancies?: GovVacancy[] }[];
  };

  const vacancies = data.common?.[0]?.vacancies ?? [];
  const jobs: ScraperJobInput[] = [];

  for (const v of vacancies) {
    const title = v.jobname ?? "";
    const dept = v.deptnamejve ?? "Hong Kong Government";
    const desc = [
      "Hong Kong Government vacancy.",
      `Department: ${dept}`,
      `Pay: ${v.entrypay ?? ""}`,
      "",
      "Duties:",
      v.duties ?? "",
      "",
      "Requirements:",
      v.entreq ?? "",
    ].join("\n");

    const blob = `${title} ${desc}`;
    if (!keywordMatch(blob, keywords)) continue;

    const jobId = v.jobid;
    const url = jobId
      ? `https://www.jobs.gov.hk/0/en/jobvacancy/jobDetail/?jobId=${jobId}`
      : "https://www.jobs.gov.hk/0/en/home/";

    jobs.push({
      title,
      company: dept,
      description: desc.slice(0, 7500),
      source: "jobs_gov",
      url,
    });

    if (jobs.length >= maxJobs) break;
  }

  return jobs;
}

interface GovVacancy {
  jobname?: string;
  deptnamejve?: string;
  duties?: string;
  entreq?: string;
  entrypay?: string;
  jobid?: number;
}
