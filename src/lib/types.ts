export interface ParsedResume {
  technical_skills: string[];
  soft_skills: string[];
  years_experience: number;
  ideal_role: string;
}

export interface JobRecord {
  id: string;
  source: string;
  title: string;
  company: string;
  url: string;
  description?: string;
  created_at?: string;
}

export interface MatchedJob extends JobRecord {
  similarity: number;
  match_percent: number;
}

export interface ScraperJobInput {
  title: string;
  company: string;
  description: string;
  source?: string;
  url?: string;
}

export interface IngestResult {
  inserted: number;
  duplicates: number;
  errors: string[];
}
