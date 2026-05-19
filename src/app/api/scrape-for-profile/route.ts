import { NextRequest, NextResponse } from "next/server";
import { scrapeAndIngestForKeywords } from "@/lib/scraper/run";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 300;

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
    try {
      const body = await request.json();
      keywords =
        typeof body.keywords === "string" ? body.keywords.trim() : "";
    } catch {
      /* empty body ok */
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

    await supabase
      .from("user_profiles")
      .update({
        job_search_keywords: keywords,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);

    const result = await scrapeAndIngestForKeywords(keywords);

    await supabase
      .from("user_profiles")
      .update({ last_scrape_at: new Date().toISOString() })
      .eq("user_id", user.id);

    return NextResponse.json(result);
  } catch (err) {
    console.error("scrape-for-profile:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Scrape failed" },
      { status: 500 }
    );
  }
}
