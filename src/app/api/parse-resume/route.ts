import { NextRequest, NextResponse } from "next/server";
import { extractTextFromFile } from "@/lib/resume-parser";
import { NimParseError, parseResumeWithNim } from "@/lib/nvidia";
import { createClient } from "@/lib/supabase/server";
import {
  MAX_RESUME_FILE_BYTES,
  MIN_RESUME_TEXT_CHARS,
} from "@/lib/upload-limits";
import type { ParsedResume } from "@/lib/types";

export const runtime = "nodejs";
/** Pro/Enterprise only; Hobby still hard-caps at 10s */
export const maxDuration = 60;

function normalizeProfile(raw: ParsedResume): ParsedResume {
  return {
    technical_skills: Array.isArray(raw.technical_skills)
      ? raw.technical_skills
      : [],
    soft_skills: Array.isArray(raw.soft_skills) ? raw.soft_skills : [],
    years_experience: Number(raw.years_experience) || 0,
    ideal_role: String(raw.ideal_role ?? "Software Engineer"),
  };
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

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

    let rawProfile: ParsedResume;
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
      const { error: profileError } = await supabase.from("user_profiles").upsert(
        {
          user_id: user.id,
          technical_skills: profile.technical_skills,
          soft_skills: profile.soft_skills,
          years_experience: profile.years_experience,
          ideal_role: profile.ideal_role,
          skills: {
            technical: profile.technical_skills,
            soft: profile.soft_skills,
          },
          intent: profile.ideal_role,
          resume_text: trimmed.slice(0, 50_000),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

      if (profileError) {
        console.error("profile upsert:", profileError);
        return NextResponse.json(
          { error: "Failed to save profile" },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      profile,
      saved: Boolean(user),
    });
  } catch (err) {
    console.error("parse-resume error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
