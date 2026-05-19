from __future__ import annotations

from playwright.sync_api import Browser, Page

from config import HEADLESS, LINKEDIN_LI_AT, MAX_JOBS_PER_SOURCE, REQUEST_DELAY_SEC
from models import JobListing, ScrapeResult
from scrapers.base import BaseScraper
from utils import clean_text, scroll_results, slug_query


class LinkedInHKScraper(BaseScraper):
    source_id = "linkedin"

    def search_url(self) -> str:
        q = slug_query(self.keywords)
        loc = slug_query(self.location)
        return (
            f"https://www.linkedin.com/jobs/search?"
            f"keywords={q}&location={loc}&f_TPR=r604800"
        )

    def run(self, browser: Browser | None = None) -> ScrapeResult:
        result = ScrapeResult(source=self.source_id)
        if not LINKEDIN_LI_AT:
            result.errors.append(
                "LinkedIn: set LINKEDIN_LI_AT in scraper/.env (optional). "
                "Skipping deep scrape — use indeed + jobsdb without login."
            )
            return result
        return super().run(browser)

    def _scrape(self, browser: Browser, result: ScrapeResult) -> None:
        context = browser.new_context(
            locale="en-HK",
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/131.0.0.0 Safari/537.36"
            ),
        )
        context.add_cookies(
            [
                {
                    "name": "li_at",
                    "value": LINKEDIN_LI_AT,
                    "domain": ".linkedin.com",
                    "path": "/",
                }
            ]
        )
        page = context.new_page()
        page.set_default_timeout(45_000)
        try:
            page.goto(self.search_url(), wait_until="domcontentloaded")
            page.wait_for_timeout(2500)
            listings = self.collect_listing_urls(page)[: self.max_jobs]
            import time

            for listing in listings:
                try:
                    desc = self.fetch_job_description(page, listing)
                    job = JobListing(
                        title=listing.get("title", "Job"),
                        company=listing.get("company", "Company"),
                        description=clean_text(desc),
                        source=self.source_id,
                        url=listing.get("url", ""),
                    )
                    if job.is_valid():
                        result.jobs.append(job)
                    time.sleep(self.delay_sec)
                except Exception as exc:
                    result.errors.append(str(exc))
        finally:
            context.close()

    def collect_listing_urls(self, page: Page) -> list[dict[str, str]]:
        scroll_results(page, times=4)
        listings: list[dict[str, str]] = []
        seen: set[str] = set()

        cards = page.locator(
            "div.base-card, li.jobs-search-results__list-item, ul.scaffold-layout__list-container li"
        )
        count = min(cards.count(), self.max_jobs * 2)

        for i in range(count):
            card = cards.nth(i)
            try:
                link = card.locator(
                    "a.base-card__full-link, a.job-card-container__link"
                ).first
                if link.count() == 0:
                    continue
                href = link.get_attribute("href") or ""
                if not href or href in seen:
                    continue
                seen.add(href)
                url = href.split("?")[0]
                title = clean_text(
                    card.locator(
                        "h3.base-search-card__title, "
                        "span.sr-only"
                    ).first.inner_text()
                )
                company = clean_text(
                    card.locator(
                        "h4.base-search-card__subtitle, "
                        "a.hidden-nested-link"
                    ).first.inner_text()
                    if card.locator("h4.base-search-card__subtitle").count()
                    else "Company"
                )
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

        return listings

    def fetch_job_description(self, page: Page, listing: dict[str, str]) -> str:
        page.goto(listing["url"], wait_until="domcontentloaded")
        page.wait_for_timeout(1500)
        desc = clean_text(
            page.locator(
                "div.show-more-less-html__markup, "
                "div.description__text, "
                "article.jobs-description__container"
            ).first.inner_text()
            if page.locator("div.show-more-less-html__markup").count()
            else ""
        )
        if desc:
            return f"Hong Kong — LinkedIn.\n{desc}"
        return listing.get("snippet", "")


def scrape_linkedin_hk(keywords: str, location: str, max_jobs: int, browser=None):
    return LinkedInHKScraper(keywords, location, max_jobs).run(browser)
