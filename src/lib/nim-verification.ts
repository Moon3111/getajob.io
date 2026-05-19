import type { AIAnalysis, ParsedResume } from "@/lib/types";
import { careerLevelLabel } from "@/lib/jobs/seniority";

const NIM_BASE = "https://integrate.api.nvidia.com/v1";
const CHAT_MODEL = process.env.NVIDIA_NIM_CHAT_MODEL || "meta/llama-3.1-70b-instruct";
const VERIFICATION_TIMEOUT = 10_000;

interface VerificationJob {
  job_id: string;
  title: string;
  company: string;
  description: string;
}

interface VerificationResponse {
  job_id: string;
  relevance_rating: "EXCELLENT" | "GOOD" | "FAIR" | "MISMATCH";
  fit_percentage: number;
  analysis_summary: string;
  missing_keywords: string[];
}

function getApiKey(): string {
  const key = process.env.NVIDIA_API_KEY?.trim();
  if (!key) {
    throw new Error("NVIDIA_API_KEY is not configured");
  }
  return key;
}

function truncateText(text: string, maxChars: number = 500): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + "...";
}

function buildProfileSummary(profile: ParsedResume): string {
  const skills = profile.technical_skills.slice(0, 8).join(", ");
  const softSkills = profile.soft_skills.slice(0, 3).join(", ");

  return [
    `Role: ${profile.ideal_role}`,
    `Career level: ${careerLevelLabel(profile.career_level)}`,
    `Target seniority: ${careerLevelLabel(profile.target_seniority)}`,
    `Years experience: ${profile.years_experience}`,
    skills ? `Technical Skills: ${skills}` : "",
    softSkills ? `Soft Skills: ${softSkills}` : "",
    profile.experience_summary
      ? `Summary: ${profile.experience_summary}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function performDeepVerification(
  jobs: VerificationJob[],
  profile: ParsedResume,
  manualKeywords: string[]
): Promise<Map<string, AIAnalysis | null>> {
  const resultMap = new Map<string, AIAnalysis | null>();

  if (jobs.length === 0) {
    return resultMap;
  }

  try {
    const profileSummary = buildProfileSummary(profile);
    const targetKeywords = manualKeywords.slice(0, 5).join(", ");
    const isEntryLevel = ["intern", "graduate", "junior"].includes(
      profile.target_seniority
    );

    const jobsText = jobs
      .map(
        (job, idx) =>
          `Job ${idx + 1}:\n` +
          `  ID: ${job.job_id}\n` +
          `  Title: ${job.title}\n` +
          `  Company: ${job.company}\n` +
          `  Description: ${truncateText(job.description, 300)}`
      )
      .join("\n\n");

    const systemPrompt = `You are an expert Hong Kong job matching analyst.
Analyze each job against the candidate profile.
Return ONLY a valid JSON array with exactly ${jobs.length} objects:
[
  {
    "job_id": "string",
    "relevance_rating": "EXCELLENT" | "GOOD" | "FAIR" | "MISMATCH",
    "fit_percentage": number (0-100),
    "analysis_summary": "1-2 sentence explanation",
    "missing_keywords": ["skill gaps"]
  }
]

Rules:
- If candidate is intern/graduate/junior, jobs requiring 5+ years OR titles like Senior/Lead/Director/Head/VP MUST be "MISMATCH" with fit_percentage under 30.
- Penalize overqualified roles for entry-level candidates heavily.
- No markdown. JSON array only.`;

    const userPrompt = `CANDIDATE PROFILE:
${profileSummary}

ENTRY_LEVEL_CANDIDATE: ${isEntryLevel ? "YES — reject senior/executive roles" : "NO"}

TARGET KEYWORDS:
${targetKeywords || "None"}

JOBS:
${jobsText}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), VERIFICATION_TIMEOUT);

    try {
      const response = await fetch(`${NIM_BASE}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${getApiKey()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: CHAT_MODEL,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.2,
          max_tokens: 2048,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        jobs.forEach((job) => resultMap.set(job.job_id, null));
        return resultMap;
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content?.trim();

      if (!content) {
        jobs.forEach((job) => resultMap.set(job.job_id, null));
        return resultMap;
      }

      let analyses: VerificationResponse[];
      try {
        const jsonStr = content
          .replace(/^```json?\s*/i, "")
          .replace(/```\s*$/i, "")
          .trim();
        analyses = JSON.parse(jsonStr);
        if (!Array.isArray(analyses)) throw new Error("Not array");
      } catch {
        jobs.forEach((job) => resultMap.set(job.job_id, null));
        return resultMap;
      }

      for (const analysis of analyses) {
        if (!analysis.job_id) continue;

        resultMap.set(analysis.job_id, {
          relevance_rating: validateRating(analysis.relevance_rating),
          fit_percentage: Math.min(
            100,
            Math.max(0, analysis.fit_percentage || 0)
          ),
          analysis_summary: (analysis.analysis_summary || "").slice(0, 280),
          missing_keywords: (analysis.missing_keywords || [])
            .filter((k) => typeof k === "string")
            .slice(0, 5),
        });
      }

      jobs.forEach((job) => {
        if (!resultMap.has(job.job_id)) {
          resultMap.set(job.job_id, null);
        }
      });

      return resultMap;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        console.error("Deep verification timeout");
      }
      jobs.forEach((job) => resultMap.set(job.job_id, null));
      return resultMap;
    }
  } catch {
    jobs.forEach((job) => resultMap.set(job.job_id, null));
    return resultMap;
  }
}

function validateRating(
  rating: unknown
): "EXCELLENT" | "GOOD" | "FAIR" | "MISMATCH" {
  const valid = ["EXCELLENT", "GOOD", "FAIR", "MISMATCH"];
  if (typeof rating === "string" && valid.includes(rating.toUpperCase())) {
    return rating.toUpperCase() as "EXCELLENT" | "GOOD" | "FAIR" | "MISMATCH";
  }
  return "FAIR";
}
