"use server";

import { normalizeUsername, validateUsername } from "@/lib/auth-username";
import { createServiceClient } from "@/lib/supabase/server";

export async function resolveEmailForLogin(
  identifier: string
): Promise<{ email: string | null; error?: string }> {
  const trimmed = identifier.trim();
  if (trimmed.includes("@")) {
    return { email: trimmed.toLowerCase() };
  }

  const username = trimmed.toLowerCase();
  const service = createServiceClient();

  const { data, error } = await service
    .from("user_profiles")
    .select("email")
    .eq("username", username)
    .maybeSingle();

  if (error) {
    return { email: null, error: error.message };
  }

  if (!data?.email) {
    return {
      email: null,
      error: "Username not found. Use your email or sign up first.",
    };
  }

  return { email: data.email };
}

export async function saveUsernameProfile(
  userId: string,
  email: string,
  username: string
): Promise<{ ok: boolean; error?: string }> {
  const validation = validateUsername(username);
  if (validation) {
    return { ok: false, error: validation };
  }

  const normalized = normalizeUsername(username);
  const service = createServiceClient();

  const { data: existing } = await service
    .from("user_profiles")
    .select("user_id")
    .eq("username", normalized)
    .maybeSingle();

  if (existing && existing.user_id !== userId) {
    return { ok: false, error: "Username is already taken." };
  }

  const { error } = await service.from("user_profiles").upsert(
    {
      user_id: userId,
      username: normalized,
      email: email.trim().toLowerCase(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true };
}
