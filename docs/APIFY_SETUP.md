# Job ingestion (Hong Kong)

## Recommended: free Python scraper (no Apify token)

See **[scraper/README.md](../scraper/README.md)** — Playwright scrapers for Indeed, JobsDB, jobs.gov.hk, talent.gov.hk, agencies, Glassdoor, eFinancialCareers, CPJobs, HKSlash (optional LinkedIn cookie). Pushes to `/api/ingest-jobs`.

```powershell
cd scraper
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
playwright install chromium
python run.py --sources indeed,jobsdb --push
```

---

## Optional: Apify (paid)

Live scraping can also use [Apify](https://console.apify.com) actors. You do **not** need Apify for local testing — use **Load Hong Kong sample jobs** on the dashboard or `POST /api/ingest-jobs` with `scripts/seed-hk-jobs.json`.

## 1. Create an Apify account

1. Sign up at https://console.apify.com  
2. Copy your **API token** → `APIFY_API_TOKEN` in Vercel and `.env.local`

## 2. Recommended env (Hong Kong)

```env
APIFY_API_TOKEN=apify_api_...
APIFY_WEBHOOK_SECRET=<random-long-string>
NEXT_PUBLIC_APP_URL=https://getajob-sandy.vercel.app

# Search defaults (used by cron + actors)
APIFY_SEARCH_KEYWORDS=software engineer
APIFY_SEARCH_LOCATION=Hong Kong
APIFY_MAX_ITEMS=30

# Per-source actor IDs (optional — defaults in code)
APIFY_ACTOR_LINKEDIN=bebity/linkedin-jobs-scraper
APIFY_ACTOR_JOBSDB=junglee/jobsdb-scraper
APIFY_ACTOR_INDEED=misceres/indeed-scraper
APIFY_ACTOR_BING=<your-bing-jobs-actor>
APIFY_ACTOR_GOOGLE=johnvc/google-jobs-scraper

# Match tuning
MATCH_THRESHOLD=0.62
DEFAULT_JOB_REGION=Hong Kong
```

## 3. Python scraper sources (recommended)

| Source | ID |
|--------|-----|
| Indeed HK | `indeed` |
| JobsDB | `jobsdb` |
| jobs.gov.hk | `jobs_gov` |
| talent.gov.hk | `talent_gov` |
| LinkedIn | `linkedin` |
| Glassdoor | `glassdoor` |
| eFinancialCareers | `efinancialcareers` |
| CPJobs | `cpjobs` |
| HKSlash | `hkslash` |
| Michael Page | `michael_page` |
| Randstad | `randstad` |
| Robert Half | `robert_half` |
| Ambition | `ambition` |

Bing/Google removed (bot blocks). See `scraper/README.md`.

## 4. Optional Apify sources

| Source       | Env key              | Default actor (verify on Apify Store) |
|-------------|----------------------|-------------------------------------|
| LinkedIn    | `APIFY_ACTOR_LINKEDIN` | `bebity/linkedin-jobs-scraper`    |
| JobsDB      | `APIFY_ACTOR_JOBSDB`   | `junglee/jobsdb-scraper`          |
| Indeed      | `APIFY_ACTOR_INDEED`   | `misceres/indeed-scraper`         |

Actor IDs change over time — open each actor in the Apify Store and confirm input fields (`keywords`, `location`, `maxItems`) match `src/lib/apify-sources.ts`.

## 4. Webhook URL (production)

Point Apify run webhooks to:

```
https://getajob-sandy.vercel.app/api/webhooks/apify
```

Header: `Authorization: Bearer <APIFY_WEBHOOK_SECRET>` (same value as env).

## 5. Cron (Vercel)

`vercel.json` should schedule `POST /api/cron/fetch-jobs` with header:

```
Authorization: Bearer <CRON_SECRET>
```

## 6. Without Apify (now)

1. Sign in → upload resume  
2. Dashboard → **Load Hong Kong sample jobs** (10 listings across 5 sources)  
3. Refresh matches — threshold default `0.62` for more results

## 7. Run migration 004

In Supabase SQL Editor, run `supabase/migrations/004_username_matches_hk.sql` for username login and `matches` → `auth.users` FK fix.
