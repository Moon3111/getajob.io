# Python job scraper (no Apify)

Free, self-hosted scraping for **Hong Kong** jobs. Results are sent to your existing Next.js ingest API (`/api/ingest-jobs`), which embeds listings with NVIDIA NIM and stores them in Supabase.

## Sources

| Source       | Login required | Notes                                      |
|-------------|----------------|--------------------------------------------|
| `indeed`    | No             | hk.indeed.com — search + job detail pages  |
| `jobsdb`    | No             | hk.jobsdb.com                              |
| `google_jobs` | No           | Google Jobs tab (JSON-LD when available)   |
| `bing_jobs` | No             | bing.com/jobs                              |
| `linkedin`  | Optional `li_at` cookie | Often blocked without login      |

**Recommended:** `indeed,jobsdb` (most reliable for HK without accounts).

## Setup (Windows)

```powershell
cd scraper
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
playwright install chromium
copy .env.example .env
```

Edit `scraper/.env` (or rely on project `.env.local`):

```env
INGEST_URL=http://localhost:3000/api/ingest-jobs
CRON_SECRET=<same as .env.local>
SCRAPE_KEYWORDS=software engineer
SCRAPE_LOCATION=Hong Kong
MAX_JOBS_PER_SOURCE=20
SCRAPE_SOURCES=indeed,jobsdb
```

Start the app (`npm run dev` in project root), then scrape:

```powershell
python run.py --sources indeed,jobsdb --max 15
```

Production push:

```powershell
python run.py --sources indeed,jobsdb --push `
  --ingest-url https://getajob-sandy.vercel.app/api/ingest-jobs
```

## Options

```text
--sources indeed,jobsdb,google_jobs,bing_jobs
--keywords "data analyst"
--location "Hong Kong"
--max 20
--dry-run              # only write output/jobs.json
--output output/jobs.json
--push                 # POST to ingest API
--ingest-url <url>
```

Re-push a saved file:

```powershell
python push.py output/jobs.json
```

## Schedule (daily cron)

**Windows Task Scheduler:** run `scripts/scrape-daily.ps1` at 6:00 AM.

**GitHub Actions:** add a workflow that runs `python scraper/run.py --push` with secrets `CRON_SECRET` and `INGEST_URL` (optional).

## Legal & limits

- Respect each site’s **Terms of Service** and `robots.txt`.
- Use reasonable delays (`REQUEST_DELAY_SEC=1.5` default).
- Sites may block datacenter IPs; run from your home network if Vercel cron is not used for scraping.
- **Do not** commit `LINKEDIN_LI_AT` or cookies to git.

## Troubleshooting

| Issue | Fix |
|-------|-----|
| 0 jobs from Indeed/JobsDB | Run with `HEADLESS=false` in `.env` to watch the browser; update selectors in `scrapers/*.py` if the site changed layout |
| 401 on ingest | `CRON_SECRET` must match app env |
| Push timeout | Scrape fewer jobs (`--max 10`) or run ingest locally |
| LinkedIn empty | Skip `linkedin` or set `LINKEDIN_LI_AT` (your own account risk) |

## vs Apify

This scraper is **free** but you maintain selectors when sites change. Apify actors handle that for a fee. For getajob.io MVP, **Indeed + JobsDB** locally is usually enough for Hong Kong tech roles.
