from __future__ import annotations

import json
import re

from playwright.sync_api import Page

from models import JobListing, ScrapeResult
from scrapers.base import BaseScraper
from utils import clean_text, scroll_results, slug_query


class GoogleJobsScraper(BaseScraper):
    source_id = "google_jobs"

    def search_url(self) -> str:
        q = slug_query(f"{self.keywords} jobs {self.location}")
        return f"https://www.google.com/search?q={q}&ibp=htl;jobs"

    def collect_listing_urls(self, page: Page) -> list[dict[str, str]]:
        scroll_results(page, times=3)
        listings: list[dict[str, str]] = []

        # Google Jobs cards in search embed
        cards = page.locator(
            "div[data-share-url], div.PwjeAc, li.iFjolb, div.BjJfJf"
        )
        count = min(cards.count(), self.max_jobs * 2)

        for i in range(count):
            card = cards.nth(i)
            try:
                title = clean_text(
                    card.locator("div[class*='title'], h2, span").first.inner_text()
                    if card.locator("h2, div").count()
                    else ""
                )
                if not title or len(title) < 3:
                    continue
                company = clean_text(
                    card.locator("div[class*='company'], span").nth(1).inner_text()
                    if card.locator("div[class*='company'], span").count() > 1
                    else "Company"
                )
                company = company if company and company != title else "Company"
                snippet = clean_text(card.inner_text(), max_len=500)
                listings.append(
                    {
                        "title": title,
                        "company": company,
                        "url": page.url,
                        "snippet": snippet,
                    }
                )
            except Exception:
                continue

        # Fallback: parse ld+json JobPosting blocks on page
        if len(listings) < 3:
            html = page.content()
            for block in re.findall(
                r'<script type="application/ld\+json">(.*?)</script>',
                html,
                re.DOTALL,
            ):
                try:
                    data = json.loads(block)
                    items = data if isinstance(data, list) else [data]
                    for item in items:
                        if item.get("@type") != "JobPosting":
                            continue
                        title = item.get("title", "")
                        org = item.get("hiringOrganization", {})
                        company = (
                            org.get("name", "Company")
                            if isinstance(org, dict)
                            else "Company"
                        )
                        desc = clean_text(item.get("description", ""))
                        url = item.get("url") or page.url
                        if title and desc:
                            listings.append(
                                {
                                    "title": title,
                                    "company": company,
                                    "url": url,
                                    "snippet": desc[:500],
                                }
                            )
                except json.JSONDecodeError:
                    continue

        return listings[: self.max_jobs]

    def fetch_job_description(self, page: Page, listing: dict[str, str]) -> str:
        snippet = listing.get("snippet", "")
        if len(snippet) >= 80:
            return f"Hong Kong — Google Jobs.\n{snippet}"
        return snippet


def scrape_google_jobs(keywords: str, location: str, max_jobs: int, browser=None):
    return GoogleJobsScraper(keywords, location, max_jobs).run(browser)
