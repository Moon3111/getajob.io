import time
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    page = p.chromium.launch(headless=True).new_page()
    page.goto("https://www.michaelpage.com.hk/jobs?keywords=software+engineer", timeout=60000)
    time.sleep(5)
    for sel in ["a[href*='/job/']", "a[href*='job-listing']", ".job-listing__title a", "h3 a"]:
        loc = page.locator(sel)
        print(sel, loc.count())
        for i in range(min(3, loc.count())):
            h = loc.nth(i).get_attribute("href") or ""
            if "job" in h.lower():
                print(" ", h[:100])
    page.context.browser.close()
