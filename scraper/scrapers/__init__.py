from scrapers.indeed_hk import scrape_indeed_hk
from scrapers.jobsdb_hk import scrape_jobsdb_hk
from scrapers.linkedin_hk import scrape_linkedin_hk
from scrapers.jobs_gov import scrape_jobs_gov
from scrapers.talent_gov import scrape_talent_gov
from scrapers.hk_platforms import (
    scrape_ambition,
    scrape_ctgoodjobs,
    scrape_cpjobs,
    scrape_efinancial,
    scrape_glassdoor,
    scrape_hkslash,
    scrape_michael_page,
    scrape_randstad,
    scrape_robert_half,
)

SCRAPERS = {
    # Core aggregators
    "indeed": scrape_indeed_hk,
    "jobsdb": scrape_jobsdb_hk,
    "linkedin": scrape_linkedin_hk,
    # Government & official
    "jobs_gov": scrape_jobs_gov,
    "talent_gov": scrape_talent_gov,
    # Professional & niche
    "glassdoor": scrape_glassdoor,
    "efinancialcareers": scrape_efinancial,
    "ctgoodjobs": scrape_ctgoodjobs,
    "cpjobs": scrape_cpjobs,
    "hkslash": scrape_hkslash,
    # Recruitment agencies
    "michael_page": scrape_michael_page,
    "randstad": scrape_randstad,
    "robert_half": scrape_robert_half,
    "ambition": scrape_ambition,
}

# Default batch: reliable HK sources (no bing/google)
DEFAULT_SOURCE_LIST = [
    "indeed",
    "jobsdb",
    "ctgoodjobs",
    "jobs_gov",
    "michael_page",
    "randstad",
    "hkslash",
]
