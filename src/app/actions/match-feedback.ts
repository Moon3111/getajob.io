"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type JobInteractionStatus = "saved" | "dismissed" | "applied";

export async function setMatchStatus(
  jobId: string,
  status: JobInteractionStatus,
  score?: number
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "Sign in to save or dismiss jobs" };
  }

  const { error } = await supabase.from("matches").upsert(
    {
      user_id: user.id,
      job_id: jobId,
      status,
      score: score ?? null,
    },
    { onConflict: "user_id,job_id" }
  );

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/dashboard");
  return { ok: true };
}
