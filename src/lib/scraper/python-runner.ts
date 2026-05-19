import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import type { ScraperJobInput } from "@/lib/types";

const DEFAULT_SOURCES =
  "indeed,jobsdb,ctgoodjobs,jobs_gov,michael_page,hkslash";

function resolvePythonBin(): string | null {
  const envPath = process.env.SCRAPER_PYTHON_PATH?.trim();
  if (envPath && fs.existsSync(envPath)) return envPath;

  const root = process.cwd();
  const winVenv = path.join(root, "scraper", ".venv", "Scripts", "python.exe");
  const unixVenv = path.join(root, "scraper", ".venv", "bin", "python");

  if (process.platform === "win32" && fs.existsSync(winVenv)) return winVenv;
  if (fs.existsSync(unixVenv)) return unixVenv;

  return null;
}

export interface PythonScrapeOptions {
  keywords: string;
  location?: string;
  maxPerSource?: number;
  sources?: string;
  timeoutMs?: number;
}

export async function runPythonScraper(
  options: PythonScrapeOptions
): Promise<{ jobs: ScraperJobInput[]; errors: string[] }> {
  const python = resolvePythonBin();
  if (!python) {
    return {
      jobs: [],
      errors: [
        "Python scraper not available. Run: cd scraper && python -m venv .venv && pip install -r requirements.txt && playwright install chromium",
      ],
    };
  }

  const runScript = path.join(process.cwd(), "scraper", "run.py");
  if (!fs.existsSync(runScript)) {
    return { jobs: [], errors: ["scraper/run.py not found"] };
  }

  const sources = options.sources ?? process.env.SCRAPER_SOURCES ?? DEFAULT_SOURCES;
  const max = String(options.maxPerSource ?? process.env.SCRAPER_MAX_PER_SOURCE ?? "5");
  const location = options.location ?? process.env.DEFAULT_JOB_REGION ?? "Hong Kong";
  const timeoutMs = options.timeoutMs ?? 240_000;

  const args = [
    runScript,
    "--json-stdout",
    "--dry-run",
    "--keywords",
    options.keywords,
    "--location",
    location,
    "--sources",
    sources,
    "--max",
    max,
  ];

  return new Promise((resolve) => {
    const child = spawn(python, args, {
      cwd: process.cwd(),
      env: { ...process.env },
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      resolve({
        jobs: [],
        errors: [`Scraper timed out after ${timeoutMs / 1000}s`],
      });
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        resolve({
          jobs: [],
          errors: [stderr.trim() || `Python scraper exited with code ${code}`],
        });
        return;
      }

      try {
        const parsed = JSON.parse(stdout.trim()) as {
          jobs?: ScraperJobInput[];
          error?: string;
        };
        if (parsed.error) {
          resolve({ jobs: [], errors: [parsed.error] });
          return;
        }
        resolve({
          jobs: parsed.jobs ?? [],
          errors: stderr ? [stderr.slice(0, 500)] : [],
        });
      } catch {
        resolve({
          jobs: [],
          errors: ["Failed to parse scraper output", stderr.slice(0, 300)],
        });
      }
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ jobs: [], errors: [err.message] });
    });
  });
}

export function isPythonScraperAvailable(): boolean {
  if (process.env.SCRAPER_ENABLED === "false") return false;
  return resolvePythonBin() !== null;
}
