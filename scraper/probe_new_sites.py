"""Probe HK job sites for selectors."""
from __future__ import annotations

import time
from playwright.sync_api import sync_playwright

SITES = [
    ("jobs_gov", "https://www.jobs.gov.hk/0/en/jobvacancy/?searchKeyword=software&page=1"),
    ("talent_gov", "https://www.talent.gov.hk/en/job-search?keyword=software"),
    ("glassdoor", "https://www.glassdoor.com.hk/Job/hong-kong-software-engineer-jobs-SRCH_IL.0,9_IC2308631_KO10,27.htm"),
    ("efinancial", "https://www.efinancialcareers.hk/jobs-Hong_Kong?q=software"),
    ("cpjobs", "https://www.cpjobs.com/hk/jobs?keywords=software+engineer"),
    ("hkslash", "https://www.hkslash.com/jobs"),
    ("roberthalf", "https://www.roberthalf.com.hk/jobs/all/hong-kong?keywords=software"),
    ("michaelpage", "https://www.michaelpage.com.hk/jobs?keywords=software"),
    ("randstad", "https://www.randstad.com.hk/jobs/hong-kong/?q=software"),
    ("ambition", "https://www.ambition.com.hk/jobs?keywords=software"),
]

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    ctx = browser.new_context(
        locale="en-HK",
        user_agent=(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
        ),
    )
    page = ctx.new_page()
    for name, url in SITES:
        print(f"\n=== {name} ===")
        try:
            page.goto(url, wait_until="domcontentloaded", timeout=60_000)
            time.sleep(5)
            print("title:", page.title()[:90])
            print("url:", page.url[:100])
            # generic link counts
            for sel in ["a[href*='job']", "article", "li", "h2 a", "h3 a", ".job", "[class*='job']"]:
                n = page.locator(sel).count()
                if 0 < n < 200:
                    print(f"  {sel}: {n}")
        except Exception as e:
            print("ERR:", e)
    browser.close()
