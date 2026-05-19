"""jobs.gov.hk — government vacancies via open-data JSON + Labour Dept search."""

from __future__ import annotations

import re
from urllib.parse import urljoin

import requests
from playwright.sync_api import Browser

from models import JobListing, ScrapeResult
from scrapers.base import BaseScraper
from utils import clean_text, slug_query

GOV_JSON_URL = (
    "https://www.csb.gov.hk/datagovhk/gov-vacancies/gov-job-vacancies-en.json"
)
LABOUR_SEARCH = (
    "https://www.jobs.gov.hk/0/en/jobvacancy/?searchKeyword={q}&page=1"
)


def _keyword_match(text: str, keywords: str) -> bool:
    if not keywords.strip():
        return True
    hay = text.lower()
    for token in re.split(r"[,+\s]+", keywords.lower()):
        if len(token) >= 3 and token in hay:
            return True
    return False


def fetch_gov_json_jobs(keywords: str, max_jobs: int) -> list[JobListing]:
    jobs: list[JobListing] = []
    try:
        resp = requests.get(GOV_JSON_URL, timeout=60)
        resp.raise_for_status()
        data = resp.json()
        vacancies = data.get("common", [{}])[0].get("vacancies", [])
        for v in vacancies:
            title = v.get("jobname", "")
            dept = v.get("deptnamejve", "Hong Kong Government")
            duties = v.get("duties", "")
            entreq = v.get("entreq", "")
            pay = v.get("entrypay", "")
            desc = clean_text(
                f"Hong Kong Government vacancy.\n"
                f"Department: {dept}\n"
                f"Pay: {pay}\n\n"
                f"Duties:\n{duties}\n\n"
                f"Requirements:\n{entreq}",
                max_len=7500,
            )
            blob = f"{title} {desc}"
            if not _keyword_match(blob, keywords):
                continue
            job_id = v.get("jobid", "")
            url = "https://www.jobs.gov.hk/0/en/home/"
            if job_id:
                url = (
                    f"https://www.jobs.gov.hk/0/en/jobvacancy/jobDetail/?jobId={job_id}"
                )
            jobs.append(
                JobListing(
                    title=title,
                    company=dept,
                    description=desc,
                    source="jobs_gov",
                    url=url,
                )
            )
            if len(jobs) >= max_jobs:
                break
    except Exception:
        pass
    return jobs


class JobsGovScraper(BaseScraper):
    source_id = "jobs_gov"

    def search_url(self) -> str:
        return LABOUR_SEARCH.format(q=slug_query(self.keywords))

    def collect_listing_urls(self, page) -> list[dict[str, str]]:
        listings: list[dict[str, str]] = []
        seen: set[str] = set()
        for sel in [
            "a[href*='jobDetail']",
            "a[href*='jobdetail']",
            "table a[href*='job']",
        ]:
            links = page.locator(sel)
            for i in range(min(links.count(), self.max_jobs * 2)):
                link = links.nth(i)
                try:
                    href = link.get_attribute("href") or ""
                    if not href or href in seen:
                        continue
                    url = href if href.startswith("http") else urljoin(
                        "https://www.jobs.gov.hk", href
                    )
                    seen.add(href)
                    title = clean_text(link.inner_text())
                    if title and len(title) > 2:
                        listings.append(
                            {
                                "title": title,
                                "company": "Hong Kong Labour Department",
                                "url": url,
                                "snippet": "",
                            }
                        )
                except Exception:
                    continue
            if listings:
                break
        return listings

    def fetch_job_description(self, page, listing: dict[str, str]) -> str:
        page.goto(listing["url"], wait_until="domcontentloaded")
        page.wait_for_timeout(1200)
        body = clean_text(page.locator("main, #content, body").first.inner_text())
        return f"Hong Kong — jobs.gov.hk.\n{body}" if body else ""

    def run(self, browser: Browser | None = None) -> ScrapeResult:
        result = ScrapeResult(source=self.source_id)
        try:
            json_jobs = fetch_gov_json_jobs(self.keywords, self.max_jobs)
            result.jobs.extend(json_jobs)
        except Exception as exc:
            result.errors.append(f"gov JSON: {exc}")

        if len(result.jobs) < self.max_jobs:
            browser_result = BaseScraper.run(self, browser)
            result.jobs.extend(browser_result.jobs)
            result.errors.extend(browser_result.errors)

        seen: set[str] = set()
        unique: list[JobListing] = []
        for j in result.jobs:
            key = j.title.lower()
            if key in seen:
                continue
            seen.add(key)
            unique.append(j)
        result.jobs = unique[: self.max_jobs]
        return result


def scrape_jobs_gov(keywords: str, location: str, max_jobs: int, browser=None):
    return JobsGovScraper(keywords, location, max_jobs).run(browser)
