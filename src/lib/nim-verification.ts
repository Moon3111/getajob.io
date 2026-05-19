import type { AIAnalysis, MatchedJob, ParsedResume } from "@/lib/types";

const NIM_BASE = "https://integrate.api.nvidia.com/v1";
const CHAT_MODEL = process.env.NVIDIA_NIM_CHAT_MODEL || "meta/llama-3.1-70b-instruct";
const VERIFICATION_TIMEOUT = 8000; // 8 seconds max for batch

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

/**
 * Truncates text to prevent excessive token usage in LLM calls
 */
function truncateText(text: string, maxChars: number = 500): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + "...";
}

/**
 * Builds a concise profile summary from parsed resume
 */
function buildProfileSummary(profile: ParsedResume): string {
  const skills = profile.technical_skills.slice(0, 8).join(", ");
  const softSkills = profile.soft_skills.slice(0, 3).join(", ");

  return [
    `Role: ${profile.ideal_role}`,
    `Years: ${profile.years_experience}+`,
    skills ? `Technical Skills: ${skills}` : "",
    softSkills ? `Soft Skills: ${softSkills}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Deeply analyzes a batch of 10 jobs against user's profile using NVIDIA NIM
 * Returns structured AI analysis for each job with timeout protection
 */
export async function performDeepVerification(
  jobs: VerificationJob[],
  profile: ParsedResume,
  manualKeywords: string[]
): Promise<Map<string, AIAnalysis | null>> {
  const resultMap = new Map<string, AIAnalysis | null>();

  // Early return if no jobs
  if (jobs.length === 0) {
    return resultMap;
  }

  try {
    // Build context strings
    const profileSummary = buildProfileSummary(profile);
    const targetKeywords = manualKeywords.slice(0, 5).join(", ");

    // Format jobs for the prompt
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

    // Construct the system prompt
    const systemPrompt = `You are an expert resume and job matching analyst. 
Analyze each job deeply against the provided candidate profile.
Return ONLY a valid JSON array with exactly ${jobs.length} objects matching this schema:
[
  {
    "job_id": "string",
    "relevance_rating": "EXCELLENT" | "GOOD" | "FAIR" | "MISMATCH",
    "fit_percentage": number (0-100),
    "analysis_summary": "1-2 sentence explanation of fit",
    "missing_keywords": ["array", "of", "missing", "keywords"]
  }
]
CRITICAL: Return ONLY the JSON array. No markdown, no explanation.`;

    const userPrompt = `CANDIDATE PROFILE:
${profileSummary}

TARGET KEYWORDS (Top 5 priorities):
${targetKeywords || "None specified"}

JOBS TO ANALYZE:
${jobsText}`;

    // Call NVIDIA NIM with timeout
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
          temperature: 0.3, // Low temp for consistency
          max_tokens: 2048,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const err = await response.text();
        console.error("NIM API error:", response.status, err);
        // Return null analyses for all jobs on API failure
        jobs.forEach((job) => resultMap.set(job.job_id, null));
        return resultMap;
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content?.trim();

      if (!content) {
        console.warn("Empty response from NIM");
        jobs.forEach((job) => resultMap.set(job.job_id, null));
        return resultMap;
      }

      // Parse JSON safely
      let analyses: VerificationResponse[];
      try {
        // Strip markdown code blocks if present
        const jsonStr = content
          .replace(/^```json?\s*/i, "")
          .replace(/```\s*$/i, "")
          .trim();

        analyses = JSON.parse(jsonStr);

        if (!Array.isArray(analyses)) {
          throw new Error("Response is not an array");
        }
      } catch (parseErr) {
        console.error("Failed to parse NIM response:", parseErr, "Content:", content);
        jobs.forEach((job) => resultMap.set(job.job_id, null));
        return resultMap;
      }

      // Map results back to job IDs with validation
      for (const analysis of analyses) {
        if (!analysis.job_id) continue;

        const validated: AIAnalysis = {
          relevance_rating: validateRating(analysis.relevance_rating),
          fit_percentage: Math.min(100, Math.max(0, analysis.fit_percentage || 0)),
          analysis_summary: (analysis.analysis_summary || "").slice(0, 200),
          missing_keywords: (analysis.missing_keywords || [])
            .filter((k) => typeof k === "string")
            .slice(0, 5),
        };

        resultMap.set(analysis.job_id, validated);
      }

      // Fill in any missing job IDs with null (if NIM didn't return them)
      jobs.forEach((job) => {
        if (!resultMap.has(job.job_id)) {
          resultMap.set(job.job_id, null);
        }
      });

      return resultMap;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        console.error("Deep verification timeout exceeded");
      } else {
        console.error("Deep verification error:", err);
      }
      // Return null analyses for all jobs on error
      jobs.forEach((job) => resultMap.set(job.job_id, null));
      return resultMap;
    }
  } catch (err) {
    console.error("Deep verification setup error:", err);
    // Return null analyses for all jobs
    jobs.forEach((job) => resultMap.set(job.job_id, null));
    return resultMap;
  }
}

/**
 * Validates and normalizes relevance rating
 */
function validateRating(
  rating: unknown
): "EXCELLENT" | "GOOD" | "FAIR" | "MISMATCH" {
  const valid = ["EXCELLENT", "GOOD", "FAIR", "MISMATCH"];
  if (typeof rating === "string" && valid.includes(rating.toUpperCase())) {
    return rating.toUpperCase() as "EXCELLENT" | "GOOD" | "FAIR" | "MISMATCH";
  }
  return "FAIR"; // Default fallback
}
