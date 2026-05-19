"""Probe CTgoodjobs.hk selectors before tuning ListingSiteConfig."""

from playwright.sync_api import sync_playwright

SEARCH = "https://www.ctgoodjobs.hk/job/search?keyword=software+engineer"


def main() -> None:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(locale="en-HK")
        page.goto(SEARCH, wait_until="domcontentloaded", timeout=60_000)
        page.wait_for_timeout(3000)
        links = page.eval_on_selector_all(
            "a[href*='/job/']",
            "els => els.slice(0, 10).map(e => ({ href: e.href, text: e.innerText.trim() }))",
        )
        print(f"Found {len(links)} job links (sample):")
        for item in links:
            print(f"  - {item.get('text', '')[:60]} -> {item.get('href', '')}")
        browser.close()


if __name__ == "__main__":
    main()
