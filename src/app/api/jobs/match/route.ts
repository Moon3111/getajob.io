import { NextRequest, NextResponse } from "next/server";
import { getHybridMatchedJobs } from "@/app/actions/hybrid-match-jobs";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const page = parseInt(searchParams.get("page") || "1", 10);
  const limit = parseInt(searchParams.get("limit") || "10", 10);

  const { data, error } = await getHybridMatchedJobs(page, limit);

  if (error) {
    const status = error === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error }, { status });
  }

  return NextResponse.json(data);
}
