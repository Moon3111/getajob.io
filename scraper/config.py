from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent
PROJECT_ROOT = ROOT.parent

# Load scraper/.env then project .env.local
load_dotenv(ROOT / ".env")
load_dotenv(PROJECT_ROOT / ".env.local", override=True)


def env(key: str, default: str = "") -> str:
    return os.getenv(key, default).strip()


KEYWORDS = env("SCRAPE_KEYWORDS", "software engineer")
LOCATION = env("SCRAPE_LOCATION", "Hong Kong")
MAX_JOBS_PER_SOURCE = int(env("MAX_JOBS_PER_SOURCE", "20"))
REQUEST_DELAY_SEC = float(env("REQUEST_DELAY_SEC", "1.5"))
HEADLESS = env("HEADLESS", "true").lower() not in ("0", "false", "no")
INGEST_URL = env("INGEST_URL", "http://localhost:3000/api/ingest-jobs")
CRON_SECRET = env("CRON_SECRET", "")
LINKEDIN_LI_AT = env("LINKEDIN_LI_AT", "")
DEFAULT_SOURCES = [
    s.strip()
    for s in env("SCRAPE_SOURCES", "indeed,jobsdb,google_jobs,bing_jobs").split(",")
    if s.strip()
]
