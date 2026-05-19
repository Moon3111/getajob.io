import {
  normalizeSeniorityLevel,
  type SeniorityLevel,
} from "@/lib/jobs/seniority";
import type { NimParsedResume } from "@/lib/nvidia";
import type { ParsedResume } from "@/lib/types";

export function normalizeProfile(raw: NimParsedResume | Partial<ParsedResume>): ParsedResume {
  const years = Number(raw.years_experience) || 0;
  let careerLevel = normalizeSeniorityLevel(
    "career_level" in raw ? raw.career_level : undefined
  );
  let targetSeniority = normalizeSeniorityLevel(
    "target_seniority" in raw && raw.target_seniority
      ? raw.target_seniority
      : careerLevel
  );

  if (years === 0 && careerLevel === "mid") {
    careerLevel = "graduate";
    targetSeniority = targetSeniority === "mid" ? "junior" : targetSeniority;
  }

  return {
    technical_skills: Array.isArray(raw.technical_skills)
      ? raw.technical_skills.map((s) => String(s).trim()).filter(Boolean)
      : [],
    soft_skills: Array.isArray(raw.soft_skills)
      ? raw.soft_skills.map((s) => String(s).trim()).filter(Boolean)
      : [],
    years_experience: years,
    ideal_role: String(raw.ideal_role ?? "Software Engineer").trim(),
    career_level: careerLevel,
    target_seniority: targetSeniority,
    experience_summary: String(
      "experience_summary" in raw ? raw.experience_summary ?? "" : ""
    ).trim(),
    graduation_year:
      "graduation_year" in raw && raw.graduation_year != null
        ? Number(raw.graduation_year)
        : null,
  };
}

export function inferCareerLevelFromYears(years: number): SeniorityLevel {
  if (years <= 0) return "graduate";
  if (years < 2) return "junior";
  if (years < 5) return "mid";
  if (years < 8) return "senior";
  return "lead";
}
