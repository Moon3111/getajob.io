"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { updateUserProfile } from "@/lib/supabase/profile-update";

export async function saveManualKeywords(
  keywords: string[]
): Promise<{
  ok: boolean;
  error?: string;
}> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { ok: false, error: "Sign in required" };
    }

    // Validate and limit to 5 keywords
    const validated = keywords.slice(0, 5).map((k) => k.trim()).filter(Boolean);

    if (validated.length === 0) {
      return { ok: false, error: "At least one keyword is required" };
    }

    const { ok, error } = await updateUserProfile(supabase, user.id, {
      manual_top_keywords: validated,
    });

    if (!ok) {
      return { ok: false, error: error ?? "Failed to save keywords" };
    }

    revalidatePath("/dashboard");
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { ok: false, error: message };
  }
}
