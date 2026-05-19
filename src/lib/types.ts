import type { SeniorityLevel } from "@/lib/jobs/seniority";

export interface ParsedResume {
  technical_skills: string[];
  soft_skills: string[];
  years_experience: number;
  ideal_role: string;
  career_level: SeniorityLevel;
  target_seniority: SeniorityLevel;
  experience_summary?: string;
  graduation_year?: number | null;
}

export interface AIAnalysis {
  relevance_rating: "EXCELLENT" | "GOOD" | "FAIR" | "MISMATCH";
  fit_percentage: number; // 0-100
  analysis_summary: string;
  missing_keywords: string[];
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
  ai_analysis?: AIAnalysis;
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

export interface PaginationMeta {
  currentPage: number;
  totalPages: number;
  totalResults: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface PaginatedJobsResponse {
  jobs: MatchedJob[];
  pagination: PaginationMeta;
}
