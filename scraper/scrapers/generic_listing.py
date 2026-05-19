from __future__ import annotations

import re
from dataclasses import dataclass
from urllib.parse import urljoin

from playwright.sync_api import Page

from config import REQUEST_DELAY_SEC
from scrapers.base import BaseScraper
from utils import clean_text, first_text, scroll_results, slug_query


@dataclass
class ListingSiteConfig:
    source_id: str
    base_url: str
    search_path: str  # formatted with {q} and {loc}
    card_link_selectors: list[str]
    title_selectors: list[str]
    company_selectors: list[str]
    detail_selectors: list[str]
    link_href_pattern: str | None = None  # regex to filter job detail URLs
    wait_selector: str | None = None
    locale_path: str | None = None  # e.g. en vs zh


class GenericListingScraper(BaseScraper):
    """Configurable Playwright scraper for listing + detail pages."""

    def __init__(
        self,
        config: ListingSiteConfig,
        keywords: str,
        location: str,
        max_jobs: int,
        delay_sec: float,
    ) -> None:
        super().__init__(keywords, location, max_jobs, delay_sec)
        self.cfg = config
        self.source_id = config.source_id

    def search_url(self) -> str:
        q = slug_query(self.keywords)
        loc = slug_query(self.location)
        path = self.cfg.search_path.format(q=q, loc=loc, keywords=self.keywords)
        if path.startswith("http"):
            return path
        return urljoin(self.cfg.base_url, path)

    def collect_listing_urls(self, page: Page) -> list[dict[str, str]]:
        if self.cfg.wait_selector:
            try:
                page.wait_for_selector(self.cfg.wait_selector, timeout=45_000)
            except Exception:
                pass
        scroll_results(page, times=4)
        listings: list[dict[str, str]] = []
        seen: set[str] = set()
        pattern = (
            re.compile(self.cfg.link_href_pattern, re.I)
            if self.cfg.link_href_pattern
            else None
        )

        for sel in self.cfg.card_link_selectors:
            links = page.locator(sel)
            count = min(links.count(), self.max_jobs * 3)
            for i in range(count):
                link = links.nth(i)
                try:
                    href = link.get_attribute("href") or ""
                    if not href or href.startswith("#") or "mailto:" in href:
                        continue
                    url = href if href.startswith("http") else urljoin(self.cfg.base_url, href)
                    if pattern and not pattern.search(url):
                        continue
                    if url in seen:
                        continue
                    seen.add(url)

                    title = clean_text(link.inner_text())
                    if not title or len(title) < 3:
                        card = link.locator("xpath=ancestor::article[1]").first
                        for ts in self.cfg.title_selectors:
                            if card.locator(ts).count():
                                title = clean_text(card.locator(ts).first.inner_text())
                                break

                    company = "Company"
                    card = link.locator("xpath=ancestor::article[1]").first
                    for cs in self.cfg.company_selectors:
                        if card.count() and card.locator(cs).count():
                            company = clean_text(card.locator(cs).first.inner_text())
                            break

                    listings.append(
                        {
                            "title": title or "Job",
                            "company": company,
                            "url": url,
                            "snippet": "",
                        }
                    )
                except Exception:
                    continue
            if listings:
                break

        return listings

    def fetch_job_description(self, page: Page, listing: dict[str, str]) -> str:
        page.goto(listing["url"], wait_until="domcontentloaded")
        page.wait_for_timeout(1500)
        desc = first_text(page, self.cfg.detail_selectors)
        prefix = f"Hong Kong — {self.cfg.source_id}.\n"
        if desc:
            return prefix + desc
        return listing.get("snippet", "")


def make_scraper(config: ListingSiteConfig):
    def scrape(keywords: str, location: str, max_jobs: int, browser=None):
        return GenericListingScraper(
            config, keywords, location, max_jobs, REQUEST_DELAY_SEC
        ).run(browser)

    return scrape
