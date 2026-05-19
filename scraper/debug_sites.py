"""Probe HK job sites (selectors + block detection)."""
from __future__ import annotations

import time
from pathlib import Path

from playwright.sync_api import sync_playwright

from scrapers import SCRAPERS

OUT = Path("output")
OUT.mkdir(exist_ok=True)


def main() -> None:
    ids = list(SCRAPERS.keys())
    print("Registered sources:", ", ".join(ids))
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(locale="en-HK")
        page = ctx.new_page()
        for sid in ids:
            fn = SCRAPERS[sid]
            print(f"\n=== {sid} (smoke) ===")
            try:
                r = fn("software", "Hong Kong", 2, browser)
                print(f"  jobs: {len(r.jobs)}, errors: {len(r.errors)}")
                if r.errors:
                    print(f"  -> {r.errors[0][:100]}")
            except Exception as exc:
                print(f"  FAIL: {exc}")
        browser.close()


if __name__ == "__main__":
    main()
