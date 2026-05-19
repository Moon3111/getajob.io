from __future__ import annotations

from playwright.sync_api import Page

from scrapers.base import BaseScraper
from utils import clean_text, first_text, scroll_results, slug_query


class JobsDBHKScraper(BaseScraper):
    source_id = "jobsdb"

    def search_url(self) -> str:
        q = slug_query(self.keywords)
        loc = slug_query(self.location)
        return (
            f"https://hk.jobsdb.com/jobs?"
            f"keywords={q}&locations={loc}&sortmode=ListedDate"
        )

    def collect_listing_urls(self, page: Page) -> list[dict[str, str]]:
        try:
            page.wait_for_selector(
                "a[data-automation='jobTitle'], article[data-testid='job-card']",
                timeout=45_000,
            )
        except Exception:
            if "moment" in page.title().lower():
                page.wait_for_timeout(8000)
        scroll_results(page, times=5)
        listings: list[dict[str, str]] = []
        seen: set[str] = set()

        cards = page.locator(
            "article[data-testid='job-card'], "
            "div[data-card-type='JobCard'], "
            "a[data-automation='jobTitle']"
        )

        # If page uses title links directly
        title_links = page.locator("a[data-automation='jobTitle']")
        if title_links.count() > 0:
            for i in range(min(title_links.count(), self.max_jobs * 2)):
                link = title_links.nth(i)
                try:
                    href = link.get_attribute("href") or ""
                    if not href or href in seen:
                        continue
                    url = href if href.startswith("http") else f"https://hk.jobsdb.com{href}"
                    seen.add(href)
                    title = clean_text(link.inner_text())
                    card = link.locator("xpath=ancestor::article").first
                    company = ""
                    if card.count() > 0:
                        company = clean_text(
                            card.locator(
                                "a[data-automation='jobCompany'], "
                                "span[data-automation='jobCompany']"
                            ).first.inner_text()
                            if card.locator("a[data-automation='jobCompany']").count()
                            else ""
                        )
                    listings.append(
                        {
                            "title": title or "Job",
                            "company": company or "Company",
                            "url": url,
                            "snippet": "",
                        }
                    )
                except Exception:
                    continue
            return listings

        count = min(cards.count(), self.max_jobs * 2)
        for i in range(count):
            card = cards.nth(i)
            try:
                link = card.locator("a[data-automation='jobTitle'], h3 a").first
                if link.count() == 0:
                    continue
                href = link.get_attribute("href") or ""
                if not href or href in seen:
                    continue
                url = href if href.startswith("http") else f"https://hk.jobsdb.com{href}"
                seen.add(href)
                title = clean_text(link.inner_text())
                company = clean_text(
                    card.locator(
                        "a[data-automation='jobCompany'], "
                        "[data-automation='jobCardCompany']"
                    ).first.inner_text()
                    if card.locator("a[data-automation='jobCompany']").count()
                    else ""
                )
                listings.append(
                    {
                        "title": title or "Job",
                        "company": company or "Company",
                        "url": url,
                        "snippet": clean_text(card.inner_text(), max_len=350),
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
                "[data-automation='jobAdDetails']",
                "#job-details",
            ],
        )
        if not desc:
            desc = first_text(
                page,
                [
                    "div[data-automation='jobAdDetails']",
                    "div[data-automation='jobDescription']",
                    "#job-details",
                ],
            )
        if desc:
            return f"Hong Kong — JobsDB.\n{desc}"
        return listing.get("snippet", "")


def scrape_jobsdb_hk(keywords: str, location: str, max_jobs: int, browser=None):
    return JobsDBHKScraper(keywords, location, max_jobs).run(browser)
