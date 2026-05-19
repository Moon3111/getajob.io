import re
import time
from playwright.sync_api import sync_playwright

sites = [
    ("jobs_gov", "https://www.jobs.gov.hk/0/en/jobvacancy/?searchKeyword=IT&page=1"),
    ("talent", "https://www.talent.gov.hk/en/job-search?keyword=IT"),
    ("efin", "https://www.efinancialcareers.com/jobs-Hong%20Kong?q=software"),
    ("cpjobs", "https://www.cpjobs.com/en/job-search?keyword=software"),
    ("mp", "https://www.michaelpage.com.hk/jobs?keywords=software"),
    ("rh", "https://www.roberthalf.com/hk/en/jobs/hong-kong/all"),
    ("rs", "https://www.randstad.com.hk/jobs/hong-kong/"),
    ("hkslash", "https://hkslash.com/zh/jobs"),
]

with sync_playwright() as p:
    page = p.chromium.launch(headless=True).new_page()
    for n, u in sites:
        page.goto(u, timeout=60000)
        time.sleep(7)
        html = page.content()
        links = re.findall(r'href="([^"]*(?:job|vacanc|position|career|Job)[^"]*)"', html, re.I)
        uniq = list(dict.fromkeys(links))
        print(n, "|", page.title()[:55], "|", len(uniq), "links")
        for L in uniq[:5]:
            print("  ", L[:95])
    page.context.browser.close()
