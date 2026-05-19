from __future__ import annotations

import json
import sys
from typing import Any

import requests

from config import CRON_SECRET, INGEST_URL
from models import JobListing


def push_jobs(jobs: list[JobListing], ingest_url: str | None = None) -> dict[str, Any]:
    url = ingest_url or INGEST_URL
    secret = CRON_SECRET

    if not secret:
        raise ValueError("CRON_SECRET is not set (scraper/.env or project .env.local)")

    payload = {"jobs": [j.to_api_payload() for j in jobs if j.is_valid()]}
    if not payload["jobs"]:
        return {"inserted": 0, "duplicates": 0, "errors": ["No valid jobs to ingest"]}

    response = requests.post(
        url,
        headers={
            "Authorization": f"Bearer {secret}",
            "Content-Type": "application/json",
        },
        json=payload,
        timeout=600,
    )

    try:
        data = response.json()
    except json.JSONDecodeError:
        data = {"error": response.text[:500]}

    if response.status_code >= 400:
        raise RuntimeError(f"Ingest failed ({response.status_code}): {data}")

    return data


if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else "output/jobs.json"
    with open(path, encoding="utf-8") as f:
        raw = json.load(f)
    listings = [
        JobListing(
            title=j["title"],
            company=j["company"],
            description=j["description"],
            source=j.get("source", "scraper"),
            url=j.get("url", ""),
        )
        for j in raw
    ]
    print(json.dumps(push_jobs(listings), indent=2))
