"""HK professional & agency platforms (config-driven)."""

from scrapers.generic_listing import ListingSiteConfig, make_scraper

MICHAEL_PAGE = ListingSiteConfig(
    source_id="michael_page",
    base_url="https://www.michaelpage.com.hk",
    search_path="/jobs?keywords={q}",
    wait_selector="h3 a[href*='job-detail']",
    card_link_selectors=["h3 a[href*='job-detail']", "a[href*='job-detail']"],
    title_selectors=["h3", "h2"],
    company_selectors=["[class*='company']", "span"],
    detail_selectors=[
        "[class*='job-description']",
        "[class*='description']",
        "main article",
        "main",
    ],
    link_href_pattern=r"job-detail",
)

RANDSTAD = ListingSiteConfig(
    source_id="randstad",
    base_url="https://www.randstad.com.hk",
    search_path="/jobs/hong-kong/?q={q}",
    wait_selector="h3 a, article",
    card_link_selectors=[
        "h3 a[href*='/jobs/']",
        "a[href*='/jobs/hong-kong/']",
        "article a[href*='/jobs/']",
    ],
    title_selectors=["h2", "h3", "span[class*='title']"],
    company_selectors=["[class*='company']", "span[class*='subtitle']"],
    detail_selectors=[
        "[class*='job-description']",
        "[class*='description']",
        "main article",
        "main",
    ],
    link_href_pattern=r"/jobs/hong-kong/.+",
)

ROBERT_HALF = ListingSiteConfig(
    source_id="robert_half",
    base_url="https://www.roberthalf.com",
    search_path="/hk/en/find-jobs/all-jobs?q={q}&location=hong-kong",
    wait_selector="a[href*='/jobs/']",
    card_link_selectors=[
        "a[href*='/hk/en/jobs/'][href*='-']",
        ".job-listing a",
        "article a[href*='/jobs/']",
    ],
    title_selectors=["h2", "h3", ".job-title"],
    company_selectors=["[class*='company']", ".company"],
    detail_selectors=[
        "[class*='job-description']",
        "[class*='description']",
        "main article",
        "main",
    ],
    link_href_pattern=r"/hk/en/jobs/[^?]+",
)

AMBITION = ListingSiteConfig(
    source_id="ambition",
    base_url="https://www.ambition.com.hk",
    search_path="/jobs?keywords={q}",
    wait_selector="a[href*='/job/']",
    card_link_selectors=["a[href*='/job/']", "article a"],
    title_selectors=["h2", "h3"],
    company_selectors=["[class*='company']"],
    detail_selectors=["[class*='description']", "main article", "main"],
    link_href_pattern=r"/job/",
)

GLASSDOOR = ListingSiteConfig(
    source_id="glassdoor",
    base_url="https://www.glassdoor.com.hk",
    search_path="/Job/jobs.htm?sc.keyword={q}&locT=C&locId=2308631",
    wait_selector="li[data-test='jobListing'], a[href*='/job-listing/']",
    card_link_selectors=[
        "a[data-test='job-title']",
        "a[href*='/job-listing/']",
        "li[data-test='jobListing'] a",
    ],
    title_selectors=["[data-test='job-title']"],
    company_selectors=["[data-test='employer-name']", "span[class*='employer']"],
    detail_selectors=[
        "[class*='JobDetails']",
        "[class*='description']",
        "main",
    ],
    link_href_pattern=r"job-listing|/Job/",
)

EFINANCIAL = ListingSiteConfig(
    source_id="efinancialcareers",
    base_url="https://www.efinancialcareers.com",
    search_path="/jobs-Hong%20Kong?q={q}",
    wait_selector="a[href*='/jobs/']",
    card_link_selectors=[
        "a[href*='/jobs-'][href*='.']",
        "article a[href*='/job']",
        "a[data-testid*='job']",
    ],
    title_selectors=["h2", "h3", "a"],
    company_selectors=["[class*='company']", "span"],
    detail_selectors=[
        "[class*='job-description']",
        "[class*='description']",
        "main",
    ],
    link_href_pattern=r"/jobs-|/job/",
)

CPJOBS = ListingSiteConfig(
    source_id="cpjobs",
    base_url="https://www.cpjobs.com",
    search_path="/en/job-search?keyword={q}",
    wait_selector="a[href*='job']",
    card_link_selectors=[
        "a[href*='/job/']",
        "a[href*='job-detail']",
        ".job-title a",
    ],
    title_selectors=["h2", "h3", ".job-title"],
    company_selectors=["[class*='company']"],
    detail_selectors=["[class*='description']", "main"],
    link_href_pattern=r"/job/",
)

HKSLASH = ListingSiteConfig(
    source_id="hkslash",
    base_url="https://hkslash.com",
    search_path="/en/jobs?q={q}",
    wait_selector="h3 a",
    card_link_selectors=["h3 a[href*='/jobs/']", "a[href*='/jobs/'][href*='-']"],
    title_selectors=["h3"],
    company_selectors=["[class*='company']", "p"],
    detail_selectors=["article", "main", ".content"],
    link_href_pattern=r"/jobs/\d|/jobs/[^/]+$",
)

scrape_michael_page = make_scraper(MICHAEL_PAGE)
scrape_randstad = make_scraper(RANDSTAD)
scrape_robert_half = make_scraper(ROBERT_HALF)
scrape_ambition = make_scraper(AMBITION)
scrape_glassdoor = make_scraper(GLASSDOOR)
scrape_efinancial = make_scraper(EFINANCIAL)
scrape_cpjobs = make_scraper(CPJOBS)
scrape_hkslash = make_scraper(HKSLASH)
