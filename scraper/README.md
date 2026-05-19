# Python job scraper (no Apify)

Free Playwright scraping for **Hong Kong** jobs. Pushes to `/api/ingest-jobs`.

## Sources

| ID | Platform | Type |
|----|----------|------|
| `indeed` | Indeed HK | Aggregator |
| `jobsdb` | JobsDB HK | Aggregator (+ agency listings) |
| `linkedin` | LinkedIn | Professional (optional `LINKEDIN_LI_AT` cookie) |
| `jobs_gov` | jobs.gov.hk | Government JSON + Labour Dept |
| `talent_gov` | talent.gov.hk | Official manpower portal (SPA) |
| `glassdoor` | Glassdoor HK | Reviews + jobs (may hit Cloudflare) |
| `efinancialcareers` | eFinancialCareers | Finance / banking / fintech |
| `cpjobs` | CPJobs | Industry matching |
| `hkslash` | HKSlash | Free HK job board |
| `michael_page` | Michael Page | Agency |
| `randstad` | Randstad | Agency |
| `robert_half` | Robert Half | Agency (finance, IT, admin) |
| `ambition` | Ambition | Agency (mid–senior) |

**Removed:** `bing_jobs`, `google_jobs` (unreliable bot blocks).

**Recommended default batch:** `indeed,jobsdb,jobs_gov,michael_page,randstad,hkslash`

## Setup (Windows)

```powershell
cd scraper
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
playwright install chromium
copy .env.example .env
```

## Run

```powershell
# Reliable HK batch
python run.py --sources indeed,jobsdb,jobs_gov,michael_page,hkslash --max 10

# All platforms (slower; some may return 0 if blocked)
python run.py --max 15 --push

# Government IT roles only
python run.py --sources jobs_gov --keywords "information technology" --max 10 --dry-run
```

## Environment

```env
INGEST_URL=http://localhost:3000/api/ingest-jobs
CRON_SECRET=<same as .env.local>
SCRAPE_KEYWORDS=software engineer
SCRAPE_LOCATION=Hong Kong
SCRAPE_SOURCES=indeed,jobsdb,jobs_gov,michael_page,randstad,hkslash
```

## Notes

- **jobs_gov** uses Hong Kong open-data JSON (civil service) plus Labour Department HTML when available.
- **talent_gov** / **glassdoor** / **efinancialcareers** / **cpjobs** may return 0 jobs when sites block headless browsers — use `HEADLESS=false` to debug.
- Respect site Terms of Service; keep `REQUEST_DELAY_SEC=1.5` or higher.
