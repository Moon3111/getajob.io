import {
  inferSeniorityLevel,
  isJobLevelCompatible,
  normalizeSeniorityLevel,
  type SeniorityLevel,
} from "@/lib/jobs/seniority";
import type { AIAnalysis, MatchedJob } from "@/lib/types";

const MIN_AI_FIT = 35;

export function filterJobsBySeniority<
  T extends { title: string; description?: string; seniority_level?: string | null },
>(jobs: T[], careerLevel: SeniorityLevel): T[] {
  return jobs.filter((job) => {
    const jobLevel = job.seniority_level
      ? normalizeSeniorityLevel(job.seniority_level)
      : inferSeniorityLevel(job.title, job.description ?? "");
    return isJobLevelCompatible(careerLevel, jobLevel);
  });
}

export function applyVerificationFilter(jobs: MatchedJob[]): MatchedJob[] {
  return jobs
    .filter((job) => {
      const analysis = job.ai_analysis;
      if (!analysis) return true;
      if (analysis.relevance_rating === "MISMATCH") return false;
      if (analysis.fit_percentage < MIN_AI_FIT) return false;
      return true;
    })
    .sort((a, b) => scoreJob(b) - scoreJob(a));
}

function scoreJob(job: MatchedJob): number {
  const vector = job.match_percent / 100;
  const ai = job.ai_analysis?.fit_percentage ?? job.match_percent;
  return vector * 0.4 + (ai / 100) * 0.6;
}

export function mergeAiIntoMatchPercent(
  job: MatchedJob,
  analysis: AIAnalysis | null | undefined
): MatchedJob {
  if (!analysis) return job;
  const combined = Math.round(
    job.match_percent * 0.45 + analysis.fit_percentage * 0.55
  );
  return {
    ...job,
    match_percent: combined,
    ai_analysis: analysis,
  };
}
