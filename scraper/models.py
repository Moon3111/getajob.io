from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any


@dataclass
class JobListing:
    title: str
    company: str
    description: str
    source: str
    url: str = ""

    def to_api_payload(self) -> dict[str, Any]:
        return {
            "title": self.title.strip(),
            "company": self.company.strip(),
            "description": self.description.strip(),
            "source": self.source,
            "url": self.url.strip(),
        }

    def is_valid(self) -> bool:
        return bool(self.title and self.company and len(self.description) >= 40)


@dataclass
class ScrapeResult:
    source: str
    jobs: list[JobListing] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "source": self.source,
            "count": len(self.jobs),
            "errors": self.errors,
            "jobs": [j.to_api_payload() for j in self.jobs],
        }
