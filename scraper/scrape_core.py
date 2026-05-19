"""Core scrape logic (importable from run.py and Node subprocess)."""

from __future__ import annotations

from playwright.sync_api import sync_playwright

from config import HEADLESS, LOCATION
from models import JobListing
from scrapers import SCRAPERS


def scrape_jobs(
    keywords: str,
    location: str = LOCATION,
    sources: list[str] | None = None,
    max_per_source: int = 5,
) -> tuple[list[dict], list[dict]]:
    """
    Returns (job_payloads, per_source_summary).
    """
    from config import DEFAULT_SOURCES

    source_list = sources or DEFAULT_SOURCES
    unknown = [s for s in source_list if s not in SCRAPERS]
    if unknown:
        raise ValueError(f"Unknown sources: {unknown}")

    all_jobs: list[JobListing] = []
    summary: list[dict] = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=HEADLESS)
        try:
            for source in source_list:
                fn = SCRAPERS[source]
                result = fn(keywords, location, max_per_source, browser)
                all_jobs.extend(result.jobs)
                summary.append(result.to_dict())
        finally:
            browser.close()

    seen: set[tuple[str, str]] = set()
    unique: list[JobListing] = []
    for job in all_jobs:
        key = (job.title.lower(), job.company.lower())
        if key in seen:
            continue
        seen.add(key)
        unique.append(job)

    return [j.to_api_payload() for j in unique], summary
