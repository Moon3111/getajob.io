import { embedQuery, profileToEmbeddingText } from "@/lib/nvidia";
import { formatVectorForPostgres } from "@/lib/pgvector";
import type { ParsedResume } from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function buildProfileEmbeddingTexts(profile: ParsedResume): Promise<{
  cvText: string;
  roleText: string;
}> {
  const cvText = profileToEmbeddingText(profile);
  const summary =
    profile.experience_summary ||
    `${profile.career_level} candidate seeking ${profile.target_seniority} roles.`;
  const roleText = [
    `Ideal role: ${profile.ideal_role}`,
    `Career level: ${profile.career_level}`,
    `Target seniority: ${profile.target_seniority}`,
    `Years experience: ${profile.years_experience}`,
    summary,
    `Skills: ${profile.technical_skills.slice(0, 20).join(", ")}`,
  ].join("\n");

  return { cvText, roleText };
}

/** Embed full profile + role context; persist when columns exist */
export async function persistProfileEmbeddings(
  supabase: SupabaseClient,
  userId: string,
  profile: ParsedResume
): Promise<void> {
  const { cvText, roleText } = await buildProfileEmbeddingTexts(profile);
  const [cvEmbedding, roleEmbedding] = await Promise.all([
    embedQuery(cvText),
    embedQuery(roleText),
  ]);

  const payload: Record<string, unknown> = {
    career_level: profile.career_level,
    target_seniority: profile.target_seniority,
    experience_summary: profile.experience_summary ?? null,
    graduation_year: profile.graduation_year ?? null,
    updated_at: new Date().toISOString(),
  };

  const withVectors = await supabase
    .from("user_profiles")
    .update({
      ...payload,
      cv_embedding: formatVectorForPostgres(cvEmbedding),
      role_embedding: formatVectorForPostgres(roleEmbedding),
    })
    .eq("user_id", userId);

  if (
    withVectors.error?.message?.includes("cv_embedding") ||
    withVectors.error?.message?.includes("role_embedding")
  ) {
    await supabase.from("user_profiles").update(payload).eq("user_id", userId);
  }
}
