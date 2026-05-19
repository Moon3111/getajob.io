/** Semantic match threshold (0–1). Lower = more results, less strict. */
export const MATCH_THRESHOLD = Number(
  process.env.MATCH_THRESHOLD ?? "0.52"
);

export const MATCH_LIMIT = Number(process.env.MATCH_LIMIT ?? "20");

export const DEFAULT_REGION = process.env.DEFAULT_JOB_REGION ?? "Hong Kong";
