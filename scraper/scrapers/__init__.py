from scrapers.indeed_hk import scrape_indeed_hk
from scrapers.jobsdb_hk import scrape_jobsdb_hk
from scrapers.google_jobs import scrape_google_jobs
from scrapers.bing_jobs import scrape_bing_jobs
from scrapers.linkedin_hk import scrape_linkedin_hk

SCRAPERS = {
    "indeed": scrape_indeed_hk,
    "jobsdb": scrape_jobsdb_hk,
    "google_jobs": scrape_google_jobs,
    "bing_jobs": scrape_bing_jobs,
    "linkedin": scrape_linkedin_hk,
}
