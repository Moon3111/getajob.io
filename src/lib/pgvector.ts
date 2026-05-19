/** pgvector text format for PostgREST / Supabase RPC (e.g. `[0.1,0.2,...]`). */
export function formatVectorForPostgres(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}
