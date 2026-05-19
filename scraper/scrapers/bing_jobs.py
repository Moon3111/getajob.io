from __future__ import annotations

from playwright.sync_api import Page

from scrapers.base import BaseScraper
from utils import clean_text, scroll_results, slug_query


class BingJobsScraper(BaseScraper):
    source_id = "bing_jobs"

    def search_url(self) -> str:
        q = slug_query(self.keywords)
        loc = slug_query(self.location)
        return f"https://www.bing.com/jobs/search?q={q}&location={loc}"

    def collect_listing_urls(self, page: Page) -> list[dict[str, str]]:
        scroll_results(page, times=4)
        listings: list[dict[str, str]] = []
        seen: set[str] = set()

        cards = page.locator(
            "li.b_algo_slug, div.job-card, article[data-job-id], "
            "div[data-testid='job-card']"
        )
        count = min(cards.count(), self.max_jobs * 2)

        for i in range(count):
            card = cards.nth(i)
            try:
                link = card.locator("a[href*='jobs'], h2 a, a.title").first
                if link.count() == 0:
                    link = card.locator("a").first
                href = link.get_attribute("href") or ""
                if href in seen:
                    continue
                if href:
                    seen.add(href)
                title = clean_text(link.inner_text()) if link.count() else ""
                if not title:
                    title = clean_text(card.locator("h2, h3").first.inner_text())
                company = clean_text(
                    card.locator(
                        ".company, [class*='company'], span.subtitle"
                    ).first.inner_text()
                    if card.locator(".company, span.subtitle").count()
                    else "Company"
                )
                url = href if href.startswith("http") else f"https://www.bing.com{href}"
                snippet = clean_text(card.inner_text(), max_len=450)
                if title:
                    listings.append(
                        {
                            "title": title,
                            "company": company or "Company",
                            "url": url or page.url,
                            "snippet": snippet,
                        }
                    )
            except Exception:
                continue

        return listings

    def fetch_job_description(self, page: Page, listing: dict[str, str]) -> str:
        url = listing.get("url", "")
        if url and "bing.com" not in url and url.startswith("http"):
            try:
                page.goto(url, wait_until="domcontentloaded", timeout=20_000)
                page.wait_for_timeout(1200)
                body = clean_text(
                    page.locator("main, article, #job-description, body").first.inner_text()
                )
                if len(body) > 80:
                    return f"Hong Kong — Bing Jobs.\n{body[:6000]}"
            except Exception:
                pass
        snippet = listing.get("snippet", "")
        return f"Hong Kong — Bing Jobs.\n{snippet}" if snippet else snippet


def scrape_bing_jobs(keywords: str, location: str, max_jobs: int, browser=None):
    return BingJobsScraper(keywords, location, max_jobs).run(browser)
