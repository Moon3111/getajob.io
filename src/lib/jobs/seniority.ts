export type SeniorityLevel =
  | "intern"
  | "graduate"
  | "junior"
  | "mid"
  | "senior"
  | "lead"
  | "executive";

const SENIOR_PATTERNS = [
  /\b(senior|sr\.?)\b/i,
  /\b(lead|principal|staff)\b/i,
  /\b(head of|director|vp|vice president|chief|c[eo]o|cto|cfo)\b/i,
  /\b(manager|supervisor)\b/i,
  /\b(\d{2,})\+?\s*years?\s+(of\s+)?experience\b/i,
  /\b(8|9|10|11|12|15)\+?\s*years?\b/i,
];

const JUNIOR_PATTERNS = [
  /\b(fresh\s*grad|freshgraduate|recent\s+grad)\b/i,
  /\b(graduate\s+trainee|management\s+trainee)\b/i,
  /\b(entry[- ]?level|junior|intern|internship|trainee)\b/i,
  /\b(0[-–]?\s*1|0-2|1-2)\s*years?\b/i,
  /\b(no\s+experience\s+required|welcome\s+fresh)\b/i,
];

const LEAD_PATTERNS = [/\b(team\s+lead|tech\s+lead|engineering\s+lead)\b/i];

const EXEC_PATTERNS = [
  /\b(executive|chief|president|partner)\b/i,
  /\b(managing\s+director)\b/i,
];

export function normalizeSeniorityLevel(value: unknown): SeniorityLevel {
  const s = String(value ?? "mid").toLowerCase();
  const valid: SeniorityLevel[] = [
    "intern",
    "graduate",
    "junior",
    "mid",
    "senior",
    "lead",
    "executive",
  ];
  if (valid.includes(s as SeniorityLevel)) return s as SeniorityLevel;
  if (s.includes("grad")) return "graduate";
  if (s.includes("intern")) return "intern";
  if (s.includes("junior") || s.includes("entry")) return "junior";
  if (s.includes("senior")) return "senior";
  if (s.includes("lead")) return "lead";
  if (s.includes("exec") || s.includes("director")) return "executive";
  return "mid";
}

export function inferSeniorityLevel(
  title: string,
  description: string
): SeniorityLevel {
  const text = `${title}\n${description.slice(0, 2500)}`;

  if (EXEC_PATTERNS.some((p) => p.test(text))) return "executive";
  if (LEAD_PATTERNS.some((p) => p.test(text))) return "lead";
  if (/\b(senior|sr\.?)\b/i.test(title)) return "senior";
  if (JUNIOR_PATTERNS.some((p) => p.test(text))) {
    if (/\bintern/i.test(text)) return "intern";
    return /\b(fresh|graduate|entry)/i.test(text) ? "graduate" : "junior";
  }
  if (SENIOR_PATTERNS.some((p) => p.test(text))) return "senior";
  return "mid";
}

/** Hard filter when DB/RPC not available */
export function isJobLevelCompatible(
  careerLevel: SeniorityLevel,
  jobLevel: SeniorityLevel
): boolean {
  if (careerLevel === "intern" || careerLevel === "graduate") {
    return !["senior", "lead", "executive"].includes(jobLevel);
  }
  if (careerLevel === "junior") {
    return !["lead", "executive"].includes(jobLevel);
  }
  return true;
}

export function careerLevelLabel(level: SeniorityLevel): string {
  const labels: Record<SeniorityLevel, string> = {
    intern: "Intern",
    graduate: "Fresh graduate",
    junior: "Junior",
    mid: "Mid-level",
    senior: "Senior",
    lead: "Lead",
    executive: "Executive",
  };
  return labels[level] ?? level;
}
