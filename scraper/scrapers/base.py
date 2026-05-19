from __future__ import annotations

import time
from abc import ABC, abstractmethod

from playwright.sync_api import Browser, Page, sync_playwright

from config import HEADLESS, MAX_JOBS_PER_SOURCE, REQUEST_DELAY_SEC
from models import JobListing, ScrapeResult
from utils import clean_text


class BaseScraper(ABC):
    source_id: str = "unknown"

    def __init__(
        self,
        keywords: str,
        location: str,
        max_jobs: int = MAX_JOBS_PER_SOURCE,
        delay_sec: float = REQUEST_DELAY_SEC,
    ) -> None:
        self.keywords = keywords
        self.location = location
        self.max_jobs = max_jobs
        self.delay_sec = delay_sec

    @abstractmethod
    def search_url(self) -> str:
        raise NotImplementedError

    @abstractmethod
    def collect_listing_urls(self, page: Page) -> list[dict[str, str]]:
        """Return [{title, company, url}, ...] from search results."""
        raise NotImplementedError

    @abstractmethod
    def fetch_job_description(self, page: Page, listing: dict[str, str]) -> str:
        raise NotImplementedError

    def run(self, browser: Browser | None = None) -> ScrapeResult:
        result = ScrapeResult(source=self.source_id)
        own_browser = browser is None

        try:
            if own_browser:
                with sync_playwright() as p:
                    browser = p.chromium.launch(headless=HEADLESS)
                    self._scrape(browser, result)
            else:
                self._scrape(browser, result)
        except Exception as exc:
            result.errors.append(f"{self.source_id}: {exc}")

        return result

    def _scrape(self, browser: Browser, result: ScrapeResult) -> None:
        context = browser.new_context(
            locale="en-HK",
            timezone_id="Asia/Hong_Kong",
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/131.0.0.0 Safari/537.36"
            ),
            viewport={"width": 1280, "height": 900},
        )
        page = context.new_page()
        page.set_default_timeout(45_000)

        try:
            page.goto(self.search_url(), wait_until="domcontentloaded")
            time.sleep(2.5)
            if "blocked" in page.title().lower():
                time.sleep(3)
                page.goto(self.search_url(), wait_until="domcontentloaded")
                time.sleep(2)
            listings = self.collect_listing_urls(page)[: self.max_jobs]

            for listing in listings:
                try:
                    desc = self.fetch_job_description(page, listing)
                    if len(desc) < 40:
                        desc = (
                            f"{self.location}. {listing.get('snippet', '')} "
                            f"Role: {listing.get('title', '')} at "
                            f"{listing.get('company', '')}."
                        ).strip()
                    job = JobListing(
                        title=listing.get("title", "Unknown role"),
                        company=listing.get("company", "Unknown company"),
                        description=clean_text(desc),
                        source=self.source_id,
                        url=listing.get("url", ""),
                    )
                    if job.is_valid():
                        result.jobs.append(job)
                    time.sleep(self.delay_sec)
                except Exception as exc:
                    result.errors.append(
                        f"{listing.get('title', 'job')}: {exc}"
                    )
        finally:
            context.close()
