# Daily HK job scrape → ingest API
# Task Scheduler: powershell.exe -File "C:\path\to\getajob.io\scripts\scrape-daily.ps1"

$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
Set-Location "$Root\scraper"

if (-not (Test-Path ".venv\Scripts\python.exe")) {
    Write-Host "Create venv first:"
    Write-Host "  cd scraper"
    Write-Host "  python -m venv .venv"
    Write-Host "  .\.venv\Scripts\Activate.ps1"
    Write-Host "  pip install -r requirements.txt"
    Write-Host "  playwright install chromium"
    exit 1
}

$ingestUrl = $env:INGEST_URL
if (-not $ingestUrl) {
    $ingestUrl = "http://localhost:3000/api/ingest-jobs"
}

& .\.venv\Scripts\python.exe run.py `
    --sources indeed,jobsdb,jobs_gov,michael_page,randstad,hkslash `
    --max 25 `
    --push `
    --ingest-url $ingestUrl
