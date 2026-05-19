from __future__ import annotations

from playwright.sync_api import Page

from scrapers.base import BaseScraper
from utils import clean_text, first_text, scroll_results, slug_query


class IndeedHKScraper(BaseScraper):
    source_id = "indeed"

    def search_url(self) -> str:
        q = slug_query(self.keywords)
        loc = slug_query(self.location)
        return f"https://hk.indeed.com/jobs?q={q}&l={loc}"

    def collect_listing_urls(self, page: Page) -> list[dict[str, str]]:
        if "blocked" in page.title().lower():
            page.reload(wait_until="domcontentloaded")
            page.wait_for_timeout(3000)
        scroll_results(page, times=5)
        listings: list[dict[str, str]] = []
        seen: set[str] = set()

        cards = page.locator(
            "div.job_seen_beacon, div.jobsearch-ResultsList > div, "
            "div[data-testid='slider_item']"
        )
        count = min(cards.count(), self.max_jobs * 2)

        for i in range(count):
            card = cards.nth(i)
            try:
                link = card.locator("h2.jobTitle a, a.jcs-JobTitle, h2 a").first
                if link.count() == 0:
                    continue
                href = link.get_attribute("href") or ""
                jk = card.get_attribute("data-jk") or ""
                if jk:
                    url = f"https://hk.indeed.com/viewjob?jk={jk}"
                elif href:
                    url = (
                        href
                        if href.startswith("http")
                        else f"https://hk.indeed.com{href}"
                    )
                else:
                    continue
                if url in seen:
                    continue
                seen.add(url)

                title = clean_text(link.inner_text())
                company = clean_text(
                    card.locator(
                        "[data-testid='company-name'], "
                        "span.companyName, "
                        "[data-testid='company-name'] span"
                    ).first.inner_text()
                    if card.locator("[data-testid='company-name'], span.companyName").count()
                    else ""
                )
                snippet = clean_text(card.inner_text(), max_len=400)
                listings.append(
                    {
                        "title": title or "Job",
                        "company": company or "Company",
                        "url": url,
                        "snippet": snippet,
                    }
                )
            except Exception:
                continue

        return listings

    def fetch_job_description(self, page: Page, listing: dict[str, str]) -> str:
        page.goto(listing["url"], wait_until="domcontentloaded")
        page.wait_for_timeout(1500)
        desc = first_text(
            page,
            [
                "#jobDescriptionText",
                "div#jobDescriptionText",
                "[data-testid='jobsearch-JobComponent-description']",
                "div.jobsearch-jobDescriptionText",
            ],
        )
        if desc:
            return f"Hong Kong — Indeed.\n{desc}"
        return listing.get("snippet", "")


def scrape_indeed_hk(keywords: str, location: str, max_jobs: int, browser=None):
    return IndeedHKScraper(keywords, location, max_jobs).run(browser)
