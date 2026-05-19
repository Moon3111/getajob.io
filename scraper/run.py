#!/usr/bin/env python3
"""
Hong Kong job scraper — no Apify tokens.

Usage (from scraper/ folder):
  python -m venv .venv
  .venv\\Scripts\\activate          # Windows
  pip install -r requirements.txt
  playwright install chromium

  python run.py
  python run.py --sources indeed,jobsdb --max 15
  python run.py --dry-run --output output/jobs.json
  python run.py --push --ingest-url https://getajob-sandy.vercel.app/api/ingest-jobs
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# Ensure scraper/ is on path
sys.path.insert(0, str(Path(__file__).resolve().parent))

from config import (  # noqa: E402
    CRON_SECRET,
    DEFAULT_SOURCES,
    INGEST_URL,
    KEYWORDS,
    LOCATION,
    MAX_JOBS_PER_SOURCE,
)
from push import push_jobs  # noqa: E402
from scrape_core import scrape_jobs  # noqa: E402
from scrapers import SCRAPERS  # noqa: E402


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Scrape HK jobs and ingest into getajob.io")
    parser.add_argument(
        "--sources",
        default=",".join(DEFAULT_SOURCES),
        help="Comma-separated sources (see scraper/README.md). Default: HK platforms, no bing/google.",
    )
    parser.add_argument("--keywords", default=KEYWORDS)
    parser.add_argument("--location", default=LOCATION)
    parser.add_argument("--max", type=int, default=MAX_JOBS_PER_SOURCE)
    parser.add_argument("--dry-run", action="store_true", help="Save JSON only, do not call API")
    parser.add_argument("--output", default="output/jobs.json")
    parser.add_argument("--push", action="store_true", help="POST to ingest API after scrape")
    parser.add_argument("--ingest-url", default=INGEST_URL)
    parser.add_argument(
        "--json-stdout",
        action="store_true",
        help="Print job JSON array to stdout only (for Next.js integration)",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    sources = [s.strip() for s in args.sources.split(",") if s.strip()]

    unknown = [s for s in sources if s not in SCRAPERS]
    if unknown:
        msg = f"Unknown sources: {unknown}. Available: {list(SCRAPERS)}"
        if args.json_stdout:
            print(json.dumps({"error": msg}), file=sys.stderr)
            return 1
        print(msg)
        return 1

    if not args.json_stdout:
        print(f"Scraping: {sources}")
        print(f"Query: {args.keywords!r} in {args.location!r} (max {args.max}/source)\n")

    payloads, summary = scrape_jobs(
        args.keywords, args.location, sources, args.max
    )

    if args.json_stdout:
        print(json.dumps({"jobs": payloads, "summary": summary}))
        return 0

    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8") as f:
        json.dump(payloads, f, indent=2, ensure_ascii=False)

    print(f"\nTotal: {len(payloads)} unique jobs → {out_path}")

    with out_path.with_suffix(".summary.json").open("w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)

    if args.dry_run and not args.push:
        print("Dry run — not calling ingest API.")
        return 0

    if args.push or not args.dry_run:
        if not CRON_SECRET:
            print("Set CRON_SECRET in scraper/.env or .env.local to push to API.")
            return 1
        print(f"Pushing to {args.ingest_url} …")
        try:
            from models import JobListing

            listings = [
                JobListing(
                    title=j["title"],
                    company=j["company"],
                    description=j["description"],
                    source=j.get("source", "scraper"),
                    url=j.get("url", ""),
                )
                for j in payloads
            ]
            result = push_jobs(listings, args.ingest_url)
            print(json.dumps(result, indent=2))
        except Exception as exc:
            print(f"Push failed: {exc}")
            print(f"You can retry: python push.py {out_path}")
            return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
