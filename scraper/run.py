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

from playwright.sync_api import sync_playwright

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
from models import JobListing  # noqa: E402
from push import push_jobs  # noqa: E402
from scrapers import SCRAPERS  # noqa: E402


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Scrape HK jobs and ingest into getajob.io")
    parser.add_argument(
        "--sources",
        default=",".join(DEFAULT_SOURCES),
        help="Comma-separated: indeed,jobsdb,google_jobs,bing_jobs,linkedin",
    )
    parser.add_argument("--keywords", default=KEYWORDS)
    parser.add_argument("--location", default=LOCATION)
    parser.add_argument("--max", type=int, default=MAX_JOBS_PER_SOURCE)
    parser.add_argument("--dry-run", action="store_true", help="Save JSON only, do not call API")
    parser.add_argument("--output", default="output/jobs.json")
    parser.add_argument("--push", action="store_true", help="POST to ingest API after scrape")
    parser.add_argument("--ingest-url", default=INGEST_URL)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    sources = [s.strip() for s in args.sources.split(",") if s.strip()]

    unknown = [s for s in sources if s not in SCRAPERS]
    if unknown:
        print(f"Unknown sources: {unknown}. Available: {list(SCRAPERS)}")
        return 1

    all_jobs: list[JobListing] = []
    summary: list[dict] = []

    print(f"Scraping: {sources}")
    print(f"Query: {args.keywords!r} in {args.location!r} (max {args.max}/source)\n")

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=__import__("config").HEADLESS
        )
        try:
            for source in sources:
                print(f"— {source} …")
                fn = SCRAPERS[source]
                result = fn(args.keywords, args.location, args.max, browser)
                all_jobs.extend(result.jobs)
                summary.append(result.to_dict())
                print(f"  found {len(result.jobs)} jobs")
                for err in result.errors[:5]:
                    print(f"  warn: {err}")
        finally:
            browser.close()

    # Dedupe by title+company
    seen: set[tuple[str, str]] = set()
    unique: list[JobListing] = []
    for job in all_jobs:
        key = (job.title.lower(), job.company.lower())
        if key in seen:
            continue
        seen.add(key)
        unique.append(job)

    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8") as f:
        json.dump([j.to_api_payload() for j in unique], f, indent=2, ensure_ascii=False)

    print(f"\nTotal: {len(unique)} unique jobs → {out_path}")

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
            result = push_jobs(unique, args.ingest_url)
            print(json.dumps(result, indent=2))
        except Exception as exc:
            print(f"Push failed: {exc}")
            print(f"You can retry: python push.py {out_path}")
            return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
