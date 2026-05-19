# Local debugging (before Vercel deploy)

Vercel defines three environments: [Local](https://vercel.com/docs/deployments/environments#local-development-environment), [Preview](https://vercel.com/docs/deployments/environments#preview-environment-pre-production), and [Production](https://vercel.com/docs/deployments/environments#production-environment). **This guide is your Local environment** — same code as Preview/Production, running on your machine.

| Vercel environment | How you run it | URL |
| --- | --- | --- |
| **Local** | `npm run dev` | http://localhost:3000 |
| **Preview** | Push to a non-`main` branch or open a PR | `*.vercel.app` (auto-generated) |
| **Production** | Merge to `main` | Your custom domain |

Preview is for testing *hosted* builds. Use **local first** to catch TypeScript, API, and UI issues cheaply.

---

## 1. One-time machine setup

1. Install [Node.js 20 LTS](https://nodejs.org/) (includes `npm`) — usually to `C:\Program Files\nodejs`.
2. **If `node` is not recognized in Cursor’s terminal** (but Node appears in the Start Menu):
   - Fully **quit Cursor** (not just close the panel) and reopen it, **or**
   - Run from the project folder:
     ```powershell
     .\scripts\dev.ps1
     ```
   - Or use full paths once:
     ```powershell
     & "C:\Program Files\nodejs\node.exe" -v
     & "C:\Program Files\nodejs\npm.cmd" install
     ```
3. In the project root:

```bash
npm install
cp .env.example .env.local
```

3. Fill `.env.local` (see checklist below).
4. Run Supabase migrations in the [SQL Editor](https://supabase.com/dashboard):
   - `supabase/migrations/001_initial_schema.sql`
   - `supabase/migrations/002_auth_hnsw_match_jobs.sql`
5. Supabase → **Authentication → Providers** → enable **Email**.

---

## 2. Start the app

```bash
npm run dev
```

Open http://localhost:3000

**Pre-deploy verification (run before every deploy):**

```bash
npm test          # API boundary tests (no keys required if mocks suffice)
npm run build     # Same compile step Vercel runs
npm run lint      # Optional
```

---

## 3. What you can test locally (without extra tools)

| Feature | How to test |
| --- | --- |
| Landing + upload UI | http://localhost:3000 → upload `example resume.pdf` |
| Multi-step progress | Watch checklist during upload |
| Parse resume + NIM | Needs `NVIDIA_API_KEY` |
| Auth + saved profile | Sign up at `/auth/signup`, then upload |
| Job matches | Seed jobs (below), then `/dashboard` |
| Save / dismiss jobs | Thumbs on dashboard (needs auth) |
| Cron ingest (manual) | `POST /api/ingest-jobs` with `CRON_SECRET` |
| Unit tests | `npm test` |

---

## 4. Seed jobs locally (no Apify)

PowerShell:

```powershell
$secret = "your-cron-secret-from-env-local"
$jobs = Get-Content "scripts/sample-jobs.json" -Raw
Invoke-RestMethod -Uri "http://localhost:3000/api/ingest-jobs" `
  -Method POST `
  -Headers @{ Authorization = "Bearer $secret"; "Content-Type" = "application/json" } `
  -Body "{`"jobs`": $jobs}"
```

Bash:

```bash
curl -X POST http://localhost:3000/api/ingest-jobs \
  -H "Authorization: Bearer YOUR_CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d "{\"jobs\": $(cat scripts/sample-jobs.json)}"
```

---

## 5. Apify + webhooks on localhost

Apify cannot call `localhost` directly. Two options:

### A. Skip Apify locally (recommended)

Use **§4** sample ingest only.

### B. Expose localhost with a tunnel (full pipeline)

1. Install [ngrok](https://ngrok.com/) or use Cloudflare Tunnel.
2. `npm run dev` in one terminal.
3. `ngrok http 3000` in another → copy the `https://….ngrok-free.app` URL.
4. In `.env.local`:

```env
NEXT_PUBLIC_APP_URL=https://YOUR-NGROK-URL
APIFY_WEBHOOK_SECRET=your-random-secret
APIFY_API_TOKEN=...
```

5. Trigger cron:

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/cron/fetch-jobs" -Method POST `
  -Headers @{ Authorization = "Bearer YOUR_CRON_SECRET" }
```

6. When Apify finishes, it POSTs to `https://YOUR-NGROK-URL/api/webhooks/apify?secret=...`

---

## 6. Pull env vars from Vercel (optional)

If the project is already linked on Vercel:

```bash
npm i -g vercel
vercel link
vercel env pull .env.local
```

Then set `NEXT_PUBLIC_APP_URL=http://localhost:3000` for pure local UI testing (webhooks still need ngrok).

---

## 7. Preview on Vercel (after local passes)

1. Push a branch (not `main`) → Vercel creates a **Preview** deployment ([docs](https://vercel.com/docs/deployments/environments#preview-environment-pre-production)).
2. Copy preview URL → set `NEXT_PUBLIC_APP_URL` in Vercel **Preview** env vars.
3. Test there before merging to `main` (Production).

---

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| Build fails on Vercel but not locally | Run `npm run build` locally; push latest commit |
| `NVIDIA_API_KEY is not configured` | Missing in `.env.local` |
| No job matches | Empty DB — run sample ingest |
| Profile not saved | Not signed in — use `/auth/signup` |
| Apify webhook never fires | `NEXT_PUBLIC_APP_URL` not public / wrong secret |
| Upload timeout | File > 2MB or slow NIM; use smaller PDF |
