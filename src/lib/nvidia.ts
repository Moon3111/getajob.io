import { MAX_RESUME_CHARS_FOR_NIM } from "@/lib/upload-limits";

const NIM_BASE = "https://integrate.api.nvidia.com/v1";
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

export interface NimParsedResume {
  technical_skills: string[];
  soft_skills: string[];
  years_experience: number;
  ideal_role: string;
  career_level?: string;
  target_seniority?: string;
  experience_summary?: string;
  graduation_year?: number | null;
}

export async function parseResumeWithNim(
  resumeText: string
): Promise<NimParsedResume> {
  const truncated = resumeText.slice(0, MAX_RESUME_CHARS_FOR_NIM);

  const systemPrompt = `You are an expert Hong Kong career coach and resume parser.
Extract structured data for job matching. Respond with ONLY valid JSON (no markdown).

Required keys:
- "technical_skills": string[] (max 25, normalized, unique)
- "soft_skills": string[]
- "years_experience": number (0 for students/interns; count only paid full-time work)
- "ideal_role": string (realistic next role for this candidate NOW, not aspirational C-level)
- "career_level": one of "intern" | "graduate" | "junior" | "mid" | "senior" | "lead" | "executive"
- "target_seniority": same enum — roles they should apply for NOW
- "experience_summary": string (2-3 sentences; include level cues e.g. "fresh graduate seeking entry-level")
- "graduation_year": number or null`;

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
        { role: "user", content: `Parse this resume:\n\n${truncated}` },
      ],
      temperature: 0.1,
      max_tokens: 1536,
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
    return JSON.parse(jsonStr) as NimParsedResume;
  } catch {
    throw new NimParseError("AI returned invalid JSON", "invalid_json");
  }
}

async function embedWithRole(
  text: string,
  input_type: "query" | "passage"
): Promise<number[]> {
  const response = await fetch(`${NIM_BASE}/embeddings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: EMBED_MODEL,
      input: [text.slice(0, MAX_EMBED_CHARS)],
      input_type,
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

/** Candidate / profile queries */
export async function embedQuery(text: string): Promise<number[]> {
  return embedWithRole(text, "query");
}

/** Job descriptions at ingest */
export async function embedPassage(text: string): Promise<number[]> {
  return embedWithRole(text, "passage");
}

/** @deprecated Use embedQuery or embedPassage */
export async function embedText(text: string): Promise<number[]> {
  return embedQuery(text);
}

export function profileToEmbeddingText(
  profile: {
    technical_skills: string[];
    soft_skills: string[];
    years_experience: number;
    ideal_role: string;
    career_level: string;
    target_seniority: string;
    experience_summary?: string;
  },
  region = process.env.DEFAULT_JOB_REGION ?? "Hong Kong"
): string {
  const summary =
    profile.experience_summary ||
    `${profile.career_level} professional targeting ${profile.target_seniority} positions.`;

  return [
    `Preferred region: ${region}`,
    `Ideal role: ${profile.ideal_role}`,
    `Career level: ${profile.career_level}`,
    `Target seniority: ${profile.target_seniority}`,
    `Years of experience: ${profile.years_experience}`,
    `Summary: ${summary}`,
    `Technical skills: ${profile.technical_skills.join(", ")}`,
    `Soft skills: ${profile.soft_skills.join(", ")}`,
  ].join("\n");
}

export function jobToEmbeddingText(job: {
  title: string;
  company: string;
  description: string;
}): string {
  return `${job.title}\n${job.company}\n${job.description}`;
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

export function distanceToMatchPercent(distance: number): number {
  const similarity = Math.max(0, Math.min(1, 1 - distance));
  return Math.round(similarity * 100);
}
