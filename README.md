# gradjobfinder

AI-powered job matching: upload a resume, parse it with NVIDIA NIM, and find semantically similar roles via Supabase pgvector.

## Stack

- **Next.js 14** (App Router) + TypeScript + Tailwind + Shadcn-style UI
- **Supabase** (PostgreSQL + pgvector)
- **NVIDIA NIM** — Llama 3 70B (resume parsing), NV-Embed-QA (embeddings)
- **Vercel** deployment + GitHub Actions cron for job ingestion

## Quick start

### 1. Install dependencies

Requires [Node.js 18+](https://nodejs.org/) (includes npm).

```bash
npm install
cp .env.example .env.local
```

### 2. Supabase setup

1. Create a project at [supabase.com](https://supabase.com).
2. Run the migration in **SQL Editor** (or via CLI):

   - `supabase/migrations/001_initial_schema.sql`
   - `supabase/migrations/002_auth_hnsw_match_jobs.sql`

3. Enable **Email** auth under Authentication → Providers.
4. Copy **Project URL**, **anon key**, and **service role key** into `.env.local`.

### 3. NVIDIA NIM

1. Get an API key from [build.nvidia.com](https://build.nvidia.com).
2. Set `NVIDIA_API_KEY` in `.env.local`.

### 4. Run locally (debug before deploy)

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), upload a resume, then view matches on `/dashboard`.

**Full local debugging guide:** [docs/LOCAL_DEBUG.md](docs/LOCAL_DEBUG.md)  
**Pre-deploy checks:** `npm test` then `npm run build` (same as Vercel).

Copy `.env.local.example` → `.env.local` or run `vercel env pull` if the project is linked.

### 5. Deploy to Vercel

1. Push to GitHub and import the repo in [Vercel](https://vercel.com).
2. Add all variables from `.env.example` in **Project Settings → Environment Variables**.
3. Set `CRON_SECRET` and add GitHub secrets:
   - `VERCEL_FETCH_JOBS_URL` → `https://your-app.vercel.app/api/cron/fetch-jobs`
   - `CRON_SECRET` → same value as Vercel env

> **Vercel Hobby** caps serverless functions at **10s**. Resume uploads are limited to **2MB** server-side to reduce timeouts. Upgrade to Pro for `maxDuration: 60` on parse routes.

## Architecture

| Phase | Route / file | Purpose |
| --- | --- | --- |
| Resume upload | `POST /api/parse-resume` | PDF/DOCX → text → NIM JSON profile |
| Job ingest | `POST /api/ingest-jobs` | Embed jobs, dedupe at 0.95 similarity |
| Matching | `matchJobsForProfile` server action | Embed profile → `match_jobs` RPC |
| Apify cron | `POST /api/cron/fetch-jobs` | Starts Apify actor async (returns immediately) |
| Apify webhook | `POST /api/webhooks/apify` | Ingests dataset when actor succeeds |
| Auth | `/auth/login`, `@supabase/ssr` middleware | Cookie sessions, profile persistence |
| Feedback | `matches` table + `/api/refine-profile` | Save/dismiss + profile refinement |

## Tests

```bash
npm test
```

Covers `parse-resume` boundary cases: 2MB cap, short text, and `invalid_json` from NIM.

## Manual job ingest (dev)

```bash
curl -X POST http://localhost:3000/api/ingest-jobs \
  -H "Authorization: Bearer YOUR_CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d "{\"jobs\": $(cat scripts/sample-jobs.json)}"
```

## Project structure

```
src/
  app/              # Pages & API routes
  components/       # UI + ResumeUpload + Dashboard
  lib/              # Supabase, NIM, parsers
supabase/migrations # pgvector schema
.github/workflows   # Job aggregation cron
```
