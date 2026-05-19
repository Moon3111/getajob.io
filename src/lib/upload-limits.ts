/** Vercel Hobby caps serverless at 10s; keep uploads small to avoid timeouts. */
export const MAX_RESUME_FILE_BYTES = 2 * 1024 * 1024; // 2 MB

/** ~2k tokens — safe for Llama 3 70B with system prompt */
export const MAX_RESUME_CHARS_FOR_NIM = 8_000;

export const MIN_RESUME_TEXT_CHARS = 50;
