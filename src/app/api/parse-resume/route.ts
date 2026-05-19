import { NextRequest, NextResponse } from "next/server";
import { extractTextFromFile } from "@/lib/resume-parser";
import { NimParseError, parseResumeWithNim } from "@/lib/nvidia";
import { normalizeProfile } from "@/lib/profile/normalize";
import { persistProfileEmbeddings } from "@/lib/profile/embeddings";
import { createClient } from "@/lib/supabase/server";
import {
  MAX_RESUME_FILE_BYTES,
  MIN_RESUME_TEXT_CHARS,
} from "@/lib/upload-limits";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const keywordsRaw = formData.get("keywords");
    const keywords =
      typeof keywordsRaw === "string" ? keywordsRaw.trim().slice(0, 200) : "";

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    if (file.size === 0) {
      return NextResponse.json({ error: "File is empty" }, { status: 400 });
    }

    if (file.size > MAX_RESUME_FILE_BYTES) {
      return NextResponse.json(
        {
          error: `File exceeds ${MAX_RESUME_FILE_BYTES / (1024 * 1024)}MB limit. Use a smaller PDF to avoid timeouts on Vercel.`,
        },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    let resumeText: string;

    try {
      resumeText = await extractTextFromFile(buffer, file.name);
    } catch (parseErr) {
      const message =
        parseErr instanceof Error ? parseErr.message : "File parsing failed";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const trimmed = resumeText.trim();
    if (!trimmed || trimmed.length < MIN_RESUME_TEXT_CHARS) {
      return NextResponse.json(
        {
          error:
            "Could not extract enough text from the file. Try a text-based PDF (not a scan).",
        },
        { status: 400 }
      );
    }

    let rawProfile;
    try {
      rawProfile = await parseResumeWithNim(trimmed);
    } catch (nimErr) {
      if (nimErr instanceof NimParseError) {
        const status = nimErr.code === "api" ? 502 : 400;
        return NextResponse.json(
          { error: nimErr.message, code: nimErr.code },
          { status }
        );
      }
      const message =
        nimErr instanceof Error ? nimErr.message : "AI parsing failed";
      return NextResponse.json({ error: message }, { status: 502 });
    }

    const profile = normalizeProfile(rawProfile);

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
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
        const {
          career_level: _c,
          target_seniority: _t,
          experience_summary: _e,
          graduation_year: _g,
          ...legacy
        } = basePayload;
        profileError = (
          await supabase.from("user_profiles").upsert(legacy, {
            onConflict: "user_id",
          })
        ).error;
      }

      if (profileError) {
        console.error("profile upsert:", profileError);
        return NextResponse.json(
          { error: "Failed to save profile" },
          { status: 500 }
        );
      }

      try {
        await persistProfileEmbeddings(supabase, user.id, profile);
      } catch (embedErr) {
        console.warn("Profile embedding skipped:", embedErr);
      }
    }

    return NextResponse.json({
      profile,
      saved: Boolean(user),
      keywords: keywords || profile.ideal_role,
    });
  } catch (err) {
    console.error("parse-resume error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
