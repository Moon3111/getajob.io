import time
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    page = p.chromium.launch(headless=True).new_page()
    page.goto("https://www.talent.gov.hk/en/job-search?keyword=software", wait_until="domcontentloaded", timeout=60000)
    for w in [5, 10, 15]:
        time.sleep(5)
        print("wait", w, "title", page.title()[:50])
        for s in ["a[href*='job']", "[class*='Job']", "[class*='vacancy']", "motion", "article"]:
            c = page.locator(s).count()
            if c and c < 100:
                print(" ", s, c)
    page.context.browser.close()
