"use server";



import { extractTextFromFile } from "@/lib/resume-parser";

import { NimParseError, parseResumeWithNim } from "@/lib/nvidia";

import { normalizeProfile } from "@/lib/profile/normalize";

import { persistProfileEmbeddings } from "@/lib/profile/embeddings";

import { createClient } from "@/lib/supabase/server";

import {

  MAX_RESUME_FILE_BYTES,

  MIN_RESUME_TEXT_CHARS,

} from "@/lib/upload-limits";

import type { ParsedResume } from "@/lib/types";



export async function parseResumeUpload(formData: FormData): Promise<{

  ok: boolean;

  saved?: boolean;

  keywords?: string;

  profile?: ParsedResume;

  error?: string;

  code?: string;

}> {

  try {

    const file = formData.get("file");

    const keywordsRaw = formData.get("keywords");

    const keywords =

      typeof keywordsRaw === "string" ? keywordsRaw.trim().slice(0, 200) : "";



    if (!file || !(file instanceof File)) {

      return { ok: false, error: "No file uploaded" };

    }



    if (file.size === 0) {

      return { ok: false, error: "File is empty" };

    }



    if (file.size > MAX_RESUME_FILE_BYTES) {

      return {

        ok: false,

        error: `File exceeds ${MAX_RESUME_FILE_BYTES / (1024 * 1024)}MB limit.`,

      };

    }



    const buffer = Buffer.from(await file.arrayBuffer());

    let resumeText: string;



    try {

      resumeText = await extractTextFromFile(buffer, file.name);

    } catch (parseErr) {

      return {

        ok: false,

        error:

          parseErr instanceof Error ? parseErr.message : "File parsing failed",

      };

    }



    const trimmed = resumeText.trim();

    if (!trimmed || trimmed.length < MIN_RESUME_TEXT_CHARS) {

      return {

        ok: false,

        error:

          "Could not extract enough text. Try a text-based PDF (not a scan).",

      };

    }



    let rawProfile;

    try {

      rawProfile = await parseResumeWithNim(trimmed);

    } catch (nimErr) {

      if (nimErr instanceof NimParseError) {

        return {

          ok: false,

          error: nimErr.message,

          code: nimErr.code,

        };

      }

      return {

        ok: false,

        error: nimErr instanceof Error ? nimErr.message : "AI parsing failed",

        code: "api",

      };

    }



    const profile = normalizeProfile(rawProfile);

    const supabase = await createClient();

    const {

      data: { user },

    } = await supabase.auth.getUser();



    if (!user) {

      return { ok: true, saved: false, profile, keywords: keywords || profile.ideal_role };

    }



    const { data: existingProfile } = await supabase

      .from("user_profiles")

      .select("username, email")

      .eq("user_id", user.id)

      .maybeSingle();



    const basePayload: Record<string, unknown> = {

      user_id: user.id,

      email: user.email ?? existingProfile?.email ?? null,

      username: existingProfile?.username ?? null,

      technical_skills: profile.technical_skills,

      soft_skills: profile.soft_skills,

      years_experience: profile.years_experience,

      ideal_role: profile.ideal_role,

      career_level: profile.career_level,

      target_seniority: profile.target_seniority,

      experience_summary: profile.experience_summary || null,

      graduation_year: profile.graduation_year ?? null,

      skills: {

        technical: profile.technical_skills,

        soft: profile.soft_skills,

      },

      intent: profile.ideal_role,

      resume_text: trimmed.slice(0, 50_000),

      updated_at: new Date().toISOString(),

    };



    let profileError = (

      await supabase.from("user_profiles").upsert(

        {

          ...basePayload,

          job_search_keywords: keywords || profile.ideal_role || null,

        },

        { onConflict: "user_id" }

      )

    ).error;



    if (profileError?.message?.includes("job_search_keywords")) {

      profileError = (

        await supabase.from("user_profiles").upsert(basePayload, {

          onConflict: "user_id",

        })

      ).error;

    }



    if (profileError?.message?.includes("career_level")) {

      const { career_level: _c, target_seniority: _t, experience_summary: _e, graduation_year: _g, ...legacy } =

        basePayload;

      profileError = (

        await supabase.from("user_profiles").upsert(legacy, {

          onConflict: "user_id",

        })

      ).error;

    }



    if (profileError) {

      return { ok: false, error: "Failed to save profile" };

    }



    try {

      await persistProfileEmbeddings(supabase, user.id, profile);

    } catch (embedErr) {

      console.warn("Profile embedding skipped:", embedErr);

    }



    return {

      ok: true,

      saved: true,

      profile,

      keywords: keywords || profile.ideal_role,

    };

  } catch (err) {

    console.error("parseResumeUpload:", err);

    return {

      ok: false,

      error: err instanceof Error ? err.message : "Upload failed",

    };

  }

}

