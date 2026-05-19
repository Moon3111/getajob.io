from playwright.sync_api import sync_playwright
import time

checks = [
    ("jobs_gov", "https://www.jobs.gov.hk/0/en/jobvacancy/?searchKeyword=engineer&page=1"),
    ("jobs_gov2", "https://www.jobs.gov.hk/0/en/home/"),
    ("talent", "https://www.talent.gov.hk/en/job-search", 10),
    ("hkslash", "https://hkslash.com/zh/jobs", 5),
    ("michaelpage", "https://www.michaelpage.com.hk/jobs?keywords=software+engineer", 5),
    ("randstad", "https://www.randstad.com.hk/jobs/hong-kong/software-engineer/", 5),
    ("roberthalf", "https://www.roberthalf.com/hk/en/jobs/hong-kong/all?keywords=software", 5),
    ("efin", "https://www.efinancialcareers.com/jobs-Hong%20Kong?q=software+engineer", 5),
    ("cpjobs", "https://www.cpjobs.com/en/job-search?keyword=software", 5),
]

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    page = b.new_page(viewport={"width": 1400, "height": 900})
    for item in checks:
        name = item[0]
        url = item[1]
        wait = item[2] if len(item) > 2 else 5
        page.goto(url, timeout=60000)
        time.sleep(wait)
        print("\n", name, page.title()[:70])
        print(" ", page.url[:90])
        if name == "jobs_gov":
            for s in ["table tr", ".job-item", "a[href*='jobdetail']", "a[href*='JobDetail']", ".vacancy"]:
                print(s, page.locator(s).count())
        if name == "talent":
            for s in ["a[href*='/job']", "[class*='JobCard']", "motion", "article"]:
                c = page.locator(s).count()
                if c: print(s, c)
        if name == "hkslash":
            links = page.locator("h3 a")
            for i in range(min(3, links.count())):
                print(" ", links.nth(i).inner_text()[:50], links.nth(i).get_attribute("href"))
        if name in ("michaelpage", "randstad", "roberthalf"):
            for s in ["a[data-testid*='job']", "a[href*='/job/']", "article a", "h2 a", "h3 a"]:
                c = page.locator(s).count()
                if c and c < 80: print(s, c)
    b.close()
