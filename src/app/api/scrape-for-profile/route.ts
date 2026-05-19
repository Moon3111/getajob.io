import { NextRequest, NextResponse } from "next/server";
import { scrapeAndIngestForKeywords } from "@/lib/scraper/run";
import { createClient } from "@/lib/supabase/server";
import { updateUserProfile } from "@/lib/supabase/profile-update";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Sign in to scrape jobs for your profile" },
        { status: 401 }
      );
    }

    let keywords = "";
    let quick = true;
    try {
      const body = await request.json();
      keywords =
        typeof body.keywords === "string" ? body.keywords.trim() : "";
      if (body.quick === false) quick = false;
    } catch {
      /* empty body */
    }

    if (!keywords) {
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("job_search_keywords, ideal_role")
        .eq("user_id", user.id)
        .maybeSingle();

      keywords =
        profile?.job_search_keywords?.trim() ||
        profile?.ideal_role?.trim() ||
        "";
    }

    if (!keywords) {
      return NextResponse.json(
        { error: "Provide job search keywords" },
        { status: 400 }
      );
    }

    await updateUserProfile(supabase, user.id, {
      job_search_keywords: keywords,
    });

    const result = await scrapeAndIngestForKeywords(keywords, { quick });

    await updateUserProfile(supabase, user.id, {
      last_scrape_at: new Date().toISOString(),
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error("scrape-for-profile:", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Scrape failed",
        inserted: 0,
        duplicates: 0,
        scraped: 0,
        warnings: [],
      },
      { status: 500 }
    );
  }
}
