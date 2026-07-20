from __future__ import annotations

import asyncio
import time
from datetime import datetime
from zoneinfo import ZoneInfo

import httpx

from app.models import ExchangeRate


SEOUL = ZoneInfo("Asia/Seoul")
SOURCE_URL = "https://api.frankfurter.dev/v2/rate/KRW/JPY"
FALLBACK_RATE_PER_100_KRW = 10.941
FALLBACK_RATE_DATE = "2026-07-20"


class ExchangeRateService:
    def __init__(self, ttl_seconds: int = 1800) -> None:
        self.ttl_seconds = ttl_seconds
        self._cached: ExchangeRate | None = None
        self._cached_at = 0.0
        self._lock = asyncio.Lock()

    async def get_rate(self, force: bool = False) -> ExchangeRate:
        now = time.monotonic()
        if not force and self._cached and now - self._cached_at < self.ttl_seconds:
            self._cached.cache_hit = True
            return self._cached
        async with self._lock:
            now = time.monotonic()
            if not force and self._cached and now - self._cached_at < self.ttl_seconds:
                self._cached.cache_hit = True
                return self._cached
            try:
                async with httpx.AsyncClient(timeout=12.0, follow_redirects=True) as client:
                    response = await client.get(SOURCE_URL)
                    response.raise_for_status()
                    payload = response.json()
                rate = ExchangeRate(
                    rate_per_100_krw=round(float(payload["rate"]) * 100, 4),
                    as_of_date=str(payload.get("date") or ""),
                    collected_at=datetime.now(SEOUL).isoformat(timespec="seconds"),
                    source_url=SOURCE_URL,
                )
                self._cached = rate
                self._cached_at = time.monotonic()
                return rate
            except Exception as exc:
                if self._cached:
                    self._cached.cache_hit = True
                    return self._cached
                return ExchangeRate(
                    rate_per_100_krw=FALLBACK_RATE_PER_100_KRW,
                    as_of_date=FALLBACK_RATE_DATE,
                    collected_at=datetime.now(SEOUL).isoformat(timespec="seconds"),
                    source_url=SOURCE_URL,
                    cache_hit=True,
                    error=f"실시간 환율 연결 실패로 마지막 정상 환율을 사용합니다: {type(exc).__name__}",
                )
