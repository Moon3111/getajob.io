import time
from playwright.sync_api import sync_playwright

configs = [
    ("mp", "https://www.michaelpage.com.hk/jobs?keywords=software+engineer", [
        "a[href*='/job/']",
        "article.job-card a",
        ".job-card a",
        "h3 a",
        "[data-job-id]",
    ]),
    ("rs", "https://www.randstad.com.hk/jobs/hong-kong/software-engineer/", [
        "a[href*='/jobs/']",
        "article a",
        ".job-card a",
        "h3 a",
    ]),
    ("rh", "https://www.roberthalf.com/hk/en/jobs/hong-kong/all", [
        "a[href*='/jobs/']",
        ".job-listing a",
        "h2 a",
        "article a",
    ]),
    ("hkslash", "https://hkslash.com/en/jobs", [
        "h3 a",
        "a[href*='/jobs/']",
        ".job-listing a",
    ]),
    ("talent", "https://www.talent.gov.hk/en/job-search?keyword=software", [
        "a[href*='/job/']",
        "a[href*='job-detail']",
        "[class*='job'] a",
        "motion",
    ]),
    ("jobs_gov", "https://www.jobs.gov.hk/0/en/jobvacancy/", [
        "input#searchKeyword",
        "form",
    ]),
]

with sync_playwright() as p:
    page = p.chromium.launch(headless=True).new_page()
    for name, url, sels in configs:
        print("\n===", name, "===")
        page.goto(url, timeout=60000, wait_until="networkidle")
        time.sleep(3)
        print(page.title()[:70])
        if name == "jobs_gov":
            kw = page.locator("input[name*='keyword' i], input#searchKeyword, input[type='search']")
            print("search inputs", kw.count())
            if kw.count():
                kw.first.fill("software")
                page.locator("button[type='submit'], input[type='submit']").first.click()
                time.sleep(5)
                print("after search", page.url)
                for s in ["a[href*='jobDetail']", "a[href*='jobdetail']", "table a"]:
                    print(s, page.locator(s).count())
            continue
        for s in sels:
            c = page.locator(s).count()
            if c:
                print(s, c)
                if c < 15 and "a" in s:
                    for i in range(min(2, c)):
                        el = page.locator(s).nth(i)
                        print("  ->", (el.get_attribute("href") or "")[:80])
    page.context.browser.close()
