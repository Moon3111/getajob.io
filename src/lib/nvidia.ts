import { MAX_RESUME_CHARS_FOR_NIM } from "@/lib/upload-limits";

const NIM_BASE = "https://integrate.api.nvidia.com/v1";
/** Llama 3 70B was retired; catalog uses 3.1 — https://build.nvidia.com/meta/llama-3_1-70b-instruct */
const DEFAULT_CHAT_MODEL = "meta/llama-3.1-70b-instruct";
const EMBED_MODEL = "nvidia/nv-embedqa-e5-v5";
const MAX_EMBED_CHARS = 8_000;

function getApiKey(): string {
  const key = process.env.NVIDIA_API_KEY?.trim();
  if (!key) {
    throw new Error("NVIDIA_API_KEY is not configured");
  }
  return key;
}

function getChatModel(): string {
  return process.env.NVIDIA_NIM_CHAT_MODEL?.trim() || DEFAULT_CHAT_MODEL;
}

export class NimParseError extends Error {
  constructor(
    message: string,
    public readonly code: "empty" | "invalid_json" | "api" = "api"
  ) {
    super(message);
    this.name = "NimParseError";
  }
}

export async function parseResumeWithNim(resumeText: string) {
  const truncated = resumeText.slice(0, MAX_RESUME_CHARS_FOR_NIM);

  const systemPrompt = `You are a resume parser. Extract structured data from the resume text.
You MUST respond with ONLY a valid JSON object — no markdown, no explanation.
Required keys:
- "technical_skills": array of strings
- "soft_skills": array of strings
- "years_experience": number (estimate total years if unclear)
- "ideal_role": string (best-fit job title)`;

  const response = await fetch(`${NIM_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: getChatModel(),
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Parse this resume:\n\n${truncated}`,
        },
      ],
      temperature: 0.1,
      max_tokens: 1024,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new NimParseError(`NIM chat failed: ${response.status} ${err}`, "api");
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new NimParseError("Empty response from NIM", "empty");
  }

  const jsonStr = content.replace(/^```json?\s*/i, "").replace(/```\s*$/i, "");

  try {
    return JSON.parse(jsonStr) as {
      technical_skills: string[];
      soft_skills: string[];
      years_experience: number;
      ideal_role: string;
    };
  } catch {
    throw new NimParseError("AI returned invalid JSON", "invalid_json");
  }
}

export async function embedText(text: string): Promise<number[]> {
  const response = await fetch(`${NIM_BASE}/embeddings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: EMBED_MODEL,
      input: [text.slice(0, MAX_EMBED_CHARS)],
      input_type: "query",
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`NIM embeddings failed: ${response.status} ${err}`);
  }

  const data = await response.json();
  const vector = data.data?.[0]?.embedding;
  if (!vector || !Array.isArray(vector)) {
    throw new Error("Invalid embedding response from NIM");
  }
  return vector;
}

export function profileToEmbeddingText(profile: {
  technical_skills: string[];
  soft_skills: string[];
  years_experience: number;
  ideal_role: string;
}): string {
  return [
    `Ideal role: ${profile.ideal_role}`,
    `Years of experience: ${profile.years_experience}`,
    `Technical skills: ${profile.technical_skills.join(", ")}`,
    `Soft skills: ${profile.soft_skills.join(", ")}`,
  ].join("\n");
}

export async function extractKeywordsFromJobs(
  jobDescriptions: string[]
): Promise<string[]> {
  const sample = jobDescriptions
    .slice(0, 5)
    .join("\n---\n")
    .slice(0, MAX_RESUME_CHARS_FOR_NIM);

  const response = await fetch(`${NIM_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: getChatModel(),
      messages: [
        {
          role: "system",
          content:
            'Return ONLY a JSON object: { "keywords": string[] } with up to 15 skills/themes from saved jobs.',
        },
        { role: "user", content: sample },
      ],
      temperature: 0.2,
      max_tokens: 512,
    }),
  });

  if (!response.ok) return [];

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) return [];

  try {
    const parsed = JSON.parse(
      content.replace(/^```json?\s*/i, "").replace(/```\s*$/i, "")
    );
    return Array.isArray(parsed.keywords) ? parsed.keywords : [];
  } catch {
    return [];
  }
}

/** Cosine similarity from pgvector distance: similarity = 1 - distance */
export function distanceToMatchPercent(distance: number): number {
  const similarity = Math.max(0, Math.min(1, 1 - distance));
  return Math.round(similarity * 100);
}
