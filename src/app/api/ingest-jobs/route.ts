import { NextRequest, NextResponse } from "next/server";
import { ingestJobListings } from "@/lib/ingest-jobs";

export const runtime = "nodejs";
export const maxDuration = 300;

function authorizeCron(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

export async function POST(request: NextRequest) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let jobs;
  try {
    const body = await request.json();
    jobs = body.jobs;
    if (!Array.isArray(jobs)) {
      return NextResponse.json(
        { error: "Body must include a jobs array" },
        { status: 400 }
      );
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const result = await ingestJobListings(jobs);
  return NextResponse.json(result);
}
