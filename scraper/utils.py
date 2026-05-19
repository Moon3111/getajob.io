from __future__ import annotations

import re
import time
from typing import Callable
from urllib.parse import quote_plus

from playwright.sync_api import Page


def slug_query(text: str) -> str:
    return quote_plus(text.strip())


def clean_text(text: str | None, max_len: int = 8000) -> str:
    if not text:
        return ""
    collapsed = re.sub(r"\s+", " ", text).strip()
    return collapsed[:max_len]


def scroll_results(page: Page, times: int = 4, pause: float = 0.8) -> None:
    for _ in range(times):
        page.mouse.wheel(0, 2400)
        time.sleep(pause)


def first_text(page: Page, selectors: list[str]) -> str:
    for sel in selectors:
        loc = page.locator(sel).first
        if loc.count() > 0:
            try:
                text = loc.inner_text(timeout=2000)
                if text and text.strip():
                    return clean_text(text)
            except Exception:
                continue
    return ""


def retry(fn: Callable[[], str], attempts: int = 2) -> str:
    last = ""
    for _ in range(attempts):
        try:
            last = fn()
            if last:
                return last
        except Exception:
            pass
        time.sleep(0.5)
    return last
