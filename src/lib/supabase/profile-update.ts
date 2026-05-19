import type { SupabaseClient } from "@supabase/supabase-js";

/** Update profile; omit columns that may be missing if migrations were not run. */
export async function updateUserProfile(
  supabase: SupabaseClient,
  userId: string,
  fields: Record<string, unknown>
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from("user_profiles")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("user_id", userId);

  if (!error) return { ok: true };

  const msg = error.message ?? "";
  const optionalCols = [
    "job_search_keywords",
    "last_scrape_at",
    "manual_top_keywords",
  ];
  const missing = optionalCols.find((col) => msg.includes(col));

  if (missing) {
    const stripped = { ...fields };
    for (const col of optionalCols) {
      if (msg.includes(col)) delete stripped[col];
    }
    const retry = await supabase
      .from("user_profiles")
      .update({ ...stripped, updated_at: new Date().toISOString() })
      .eq("user_id", userId);
    if (!retry.error) {
      return {
        ok: true,
        error: `Note: run migration for ${missing} in Supabase.`,
      };
    }
    return { ok: false, error: retry.error.message };
  }

  return { ok: false, error: msg };
}
