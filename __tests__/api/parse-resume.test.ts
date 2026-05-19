import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/parse-resume/route";
import { MAX_RESUME_FILE_BYTES, MIN_RESUME_TEXT_CHARS } from "@/lib/upload-limits";
import { NimParseError } from "@/lib/nvidia";

vi.mock("@/lib/resume-parser", () => ({
  extractTextFromFile: vi.fn(),
}));

vi.mock("@/lib/nvidia", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/nvidia")>();
  return {
    ...actual,
    parseResumeWithNim: vi.fn(),
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: null } }) },
    from: () => ({
      upsert: async () => ({ error: null }),
    }),
  })),
}));

import { extractTextFromFile } from "@/lib/resume-parser";
import { parseResumeWithNim } from "@/lib/nvidia";

function buildRequest(file: File): NextRequest {
  const formData = new FormData();
  formData.append("file", file);
  return new NextRequest("http://localhost/api/parse-resume", {
    method: "POST",
    body: formData,
  });
}

describe("POST /api/parse-resume", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when file exceeds MAX_RESUME_FILE_BYTES", async () => {
    const oversized = new File(
      [new Uint8Array(MAX_RESUME_FILE_BYTES + 1)],
      "resume.pdf",
      { type: "application/pdf" }
    );

    const res = await POST(buildRequest(oversized));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/2MB|2\s*MB|exceeds/i);
    expect(extractTextFromFile).not.toHaveBeenCalled();
  });

  it("returns 400 when extracted text is under MIN_RESUME_TEXT_CHARS", async () => {
    vi.mocked(extractTextFromFile).mockResolvedValue("short");

    const file = new File(["%PDF"], "resume.pdf", { type: "application/pdf" });
    const res = await POST(buildRequest(file));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/enough text/i);
    expect(parseResumeWithNim).not.toHaveBeenCalled();
    expect("short".length).toBeLessThan(MIN_RESUME_TEXT_CHARS);
  });

  it("returns 400 with invalid_json code when NIM returns malformed JSON", async () => {
    vi.mocked(extractTextFromFile).mockResolvedValue(
      "A".repeat(MIN_RESUME_TEXT_CHARS + 10)
    );
    vi.mocked(parseResumeWithNim).mockRejectedValue(
      new NimParseError("AI returned invalid JSON", "invalid_json")
    );

    const file = new File(["%PDF"], "resume.pdf", { type: "application/pdf" });
    const res = await POST(buildRequest(file));
    const body = (await res.json()) as { error: string; code: string };

    expect(res.status).toBe(400);
    expect(body.code).toBe("invalid_json");
    expect(body.error).toMatch(/invalid JSON/i);
  });
});
