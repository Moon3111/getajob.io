"""talent.gov.hk — capture job API responses from SPA."""

from __future__ import annotations

import json
import time
from urllib.parse import urljoin

from playwright.sync_api import Browser, Page, sync_playwright

from config import HEADLESS, REQUEST_DELAY_SEC
from models import JobListing, ScrapeResult
from utils import clean_text, slug_query


def _parse_api_payload(payload: object, out: list[dict]) -> None:
    if isinstance(payload, dict):
        for key in ("data", "jobs", "vacancies", "results", "items", "list"):
            if key in payload and isinstance(payload[key], list):
                for item in payload[key]:
                    if isinstance(item, dict):
                        out.append(item)
        for v in payload.values():
            _parse_api_payload(v, out)
    elif isinstance(payload, list):
        for item in payload:
            _parse_api_payload(item, out)


def _item_to_listing(item: dict) -> JobListing | None:
    title = (
        item.get("jobTitle")
        or item.get("title")
        or item.get("positionTitle")
        or item.get("name")
        or ""
    )
    company = (
        item.get("companyName")
        or item.get("employer")
        or item.get("organization")
        or "Hong Kong"
    )
    desc = (
        item.get("jobDescription")
        or item.get("description")
        or item.get("duties")
        or item.get("summary")
        or ""
    )
    url = item.get("url") or item.get("jobUrl") or item.get("link") or ""
    if not title:
        return None
    description = clean_text(
        f"Hong Kong — talent.gov.hk.\n{desc or title}",
        max_len=7500,
    )
    if len(description) < 40:
        description = f"Hong Kong — talent.gov.hk.\n{title} at {company}."
    return JobListing(
        title=str(title),
        company=str(company),
        description=description,
        source="talent_gov",
        url=str(url) if url else "https://www.talent.gov.hk/en/job-search",
    )


class TalentGovScraper:
    source_id = "talent_gov"

    def __init__(self, keywords: str, location: str, max_jobs: int) -> None:
        self.keywords = keywords
        self.location = location
        self.max_jobs = max_jobs

    def search_url(self) -> str:
        q = slug_query(self.keywords)
        return f"https://www.talent.gov.hk/en/job-search?keyword={q}"

    def run(self, browser: Browser | None = None) -> ScrapeResult:
        result = ScrapeResult(source=self.source_id)
        captured: list[dict] = []

        def on_response(response) -> None:
            try:
                url = response.url.lower()
                if response.status != 200:
                    return
                if not any(
                    k in url
                    for k in ("job", "vacanc", "search", "talent", "api")
                ):
                    return
                ct = response.headers.get("content-type", "")
                if "json" not in ct and not url.endswith(".json"):
                    return
                payload = response.json()
                _parse_api_payload(payload, captured)
            except Exception:
                pass

        own = browser is None
        try:
            if own:
                with sync_playwright() as p:
                    browser = p.chromium.launch(headless=HEADLESS)
                    self._browse(browser, on_response, result, captured)
            else:
                self._browse(browser, on_response, result, captured)
        except Exception as exc:
            result.errors.append(str(exc))

        if not result.jobs:
            result.errors.append(
                "talent.gov.hk: no jobs captured (SPA may block bots). "
                "Try again with HEADLESS=false or use jobs_gov + agency sites."
            )
        return result

    def _browse(
        self,
        browser: Browser,
        on_response,
        result: ScrapeResult,
        captured: list[dict],
    ) -> None:
        ctx = browser.new_context(locale="en-HK")
        page = ctx.new_page()
        page.on("response", on_response)
        page.goto(self.search_url(), wait_until="domcontentloaded", timeout=60_000)
        time.sleep(8)
        page.keyboard.press("End")
        time.sleep(3)

        seen: set[str] = set()
        for item in captured:
            job = _item_to_listing(item)
            if not job or not job.is_valid():
                continue
            key = job.title.lower()
            if key in seen:
                continue
            seen.add(key)
            result.jobs.append(job)
            if len(result.jobs) >= self.max_jobs:
                break

        # DOM fallback
        if len(result.jobs) < self.max_jobs:
            links = page.locator("a[href*='job']")
            for i in range(min(links.count(), self.max_jobs * 2)):
                try:
                    href = links.nth(i).get_attribute("href") or ""
                    if not href or "job-search" in href:
                        continue
                    url = href if href.startswith("http") else urljoin(
                        "https://www.talent.gov.hk", href
                    )
                    title = clean_text(links.nth(i).inner_text())
                    if len(title) < 4:
                        continue
                    job = JobListing(
                        title=title,
                        company="talent.gov.hk",
                        description=f"Hong Kong — talent.gov.hk.\n{title}",
                        source=self.source_id,
                        url=url,
                    )
                    if job.is_valid() and title.lower() not in seen:
                        seen.add(title.lower())
                        result.jobs.append(job)
                except Exception:
                    continue

        ctx.close()
        time.sleep(REQUEST_DELAY_SEC)


def scrape_talent_gov(keywords: str, location: str, max_jobs: int, browser=None):
    return TalentGovScraper(keywords, location, max_jobs).run(browser)
