from __future__ import annotations

import asyncio
import re
import time
from dataclasses import asdict, dataclass
from datetime import date, datetime
from urllib.parse import urljoin
from zoneinfo import ZoneInfo

import httpx
from bs4 import BeautifulSoup

from app.data.fallback_releases import FALLBACK_RELEASES


SEOUL = ZoneInfo("Asia/Seoul")
CALENDAR_URL = "https://www.cosme.net/calendar/index/year/{year}/month/{month:02d}"
KOREAN_BRANDS = {
    "3ce", "anua", "aestura", "amuse", "banila co", "beauty of joseon",
    "byur", "clio", "cosrx", "d'alba", "dasique", "etude", "fwee",
    "hince", "innisfree", "laneige", "manyo", "medicube", "missha",
    "numbuzin", "rom&nd", "skinfood", "the saem", "tirtir", "too cool for school",
    "torriden", "vt",
}


@dataclass(slots=True)
class ReleaseProduct:
    brand: str
    name: str
    release_date: str
    category: str
    seller: str
    price_jpy: int | None
    price_text: str
    rating: float
    reviews: int
    image_url: str
    brand_logo_url: str
    product_url: str
    source_url: str

    def to_dict(self, rate_per_100_krw: float | None = None) -> dict:
        payload = asdict(self)
        payload["price_krw"] = (
            round(self.price_jpy / rate_per_100_krw * 100)
            if self.price_jpy is not None and rate_per_100_krw
            else None
        )
        return payload


@dataclass(slots=True)
class ReleaseSnapshot:
    products: list[ReleaseProduct]
    collected_at: str
    source_url: str
    fallback: bool = False
    cache_hit: bool = False


def _clean(value: str) -> str:
    return " ".join(value.split())


def _is_korean_brand(value: str) -> bool:
    normalized = re.sub(r"\([^)]*\)", "", value).strip().lower()
    return normalized in KOREAN_BRANDS


def parse_calendar_candidates(html: str, year: int, month: int) -> list[dict]:
    """Extract Korean-brand product links from an @cosme calendar month."""
    soup = BeautifulSoup(html, "html.parser")
    candidates: list[dict] = []
    seen: set[str] = set()
    for heading in soup.find_all(["h3", "h4"]):
        brand = _clean(heading.get_text(" ", strip=True))
        if not brand or not _is_korean_brand(brand):
            continue
        date_match = None
        previous = heading
        for _ in range(16):
            previous = previous.find_previous()
            if previous is None:
                break
            match = re.search(r"(\d{1,2})月(\d{1,2})日", _clean(previous.get_text(" ", strip=True)))
            if match:
                date_match = match
                break
        release_date = (
            f"{year:04d}-{month:02d}-{int(date_match.group(2)):02d}"
            if date_match
            else f"{year:04d}-{month:02d}-01"
        )
        anchors = []
        node = heading.find_next()
        while node is not None:
            if getattr(node, "name", None) in {"h3", "h4"}:
                break
            if getattr(node, "name", None) == "a" and node.get("href"):
                anchors.append(node)
            node = node.find_next()
        for anchor in anchors:
            href = str(anchor.get("href", ""))
            if not re.search(r"/products?/\d+", href) or href in seen:
                continue
            name = _clean(anchor.get_text(" ", strip=True))
            if not name or name == brand:
                continue
            seen.add(href)
            candidates.append(
                {
                    "brand": brand,
                    "name": name,
                    "release_date": release_date,
                    "product_url": urljoin("https://www.cosme.net", href),
                }
            )
    candidates.sort(key=lambda item: item["release_date"], reverse=True)
    return candidates


def parse_product_page(html: str, candidate: dict, source_url: str) -> ReleaseProduct:
    soup = BeautifulSoup(html, "html.parser")
    text = _clean(soup.get_text(" ", strip=True))

    rating_match = re.search(r"クチコミ評価\s*([0-9.]+)", text)
    reviews_match = re.search(r"クチコミ\s*[（(]?\s*([0-9,]+)\s*[件）)]", text)
    price_match = re.search(r"(?:容量・税込価格|税込価格)\s*(.+?)\s*発売日", text)
    price_text = price_match.group(1).strip() if price_match else "가격 확인 중"
    yen_values = [int(value.replace(",", "")) for value in re.findall(r"([0-9,]+)円", price_text)]
    image = soup.select_one("img[src*='skuimg'], .pic img")
    image_url = str(image.get("src", "")) if image else ""
    if not image_url:
        meta_image = soup.select_one("meta[property='og:image']")
        image_url = str(meta_image.get("content", "")) if meta_image else ""

    category_match = re.search(r"アイテムカテゴリ\s*(.+?)\s*(?:Pickupカテゴリ|商品説明)", text)
    seller = "@cosme SHOPPING" if soup.select_one("a[href*='cosme.com']") else f"{candidate['brand']} 공식·취급점"

    return ReleaseProduct(
        brand=candidate["brand"],
        name=candidate["name"],
        release_date=candidate["release_date"],
        category=(category_match.group(1).strip() if category_match else "韓国コスメ"),
        seller=seller,
        price_jpy=(yen_values[0] if yen_values else None),
        price_text=price_text,
        rating=float(rating_match.group(1)) if rating_match else 0.0,
        reviews=int(reviews_match.group(1).replace(",", "")) if reviews_match else 0,
        image_url=image_url,
        brand_logo_url="",
        product_url=candidate["product_url"],
        source_url=source_url,
    )


def fallback_release_snapshot() -> ReleaseSnapshot:
    return ReleaseSnapshot(
        products=[ReleaseProduct(**item) for item in FALLBACK_RELEASES],
        collected_at=datetime.now(SEOUL).isoformat(timespec="seconds"),
        source_url="https://www.cosme.net/calendar/",
        fallback=True,
        cache_hit=True,
    )


class ReleaseService:
    def __init__(self, ttl_seconds: int = 1800) -> None:
        self.ttl_seconds = ttl_seconds
        self._cached: ReleaseSnapshot | None = None
        self._cached_at = 0.0
        self._lock = asyncio.Lock()

    async def get_snapshot(self, force: bool = False) -> ReleaseSnapshot:
        now = time.monotonic()
        if not force and self._cached and now - self._cached_at < self.ttl_seconds:
            self._cached.cache_hit = True
            return self._cached
        async with self._lock:
            if not force and self._cached and time.monotonic() - self._cached_at < self.ttl_seconds:
                self._cached.cache_hit = True
                return self._cached
            try:
                snapshot = await self._fetch_snapshot()
            except Exception:
                snapshot = self._cached or fallback_release_snapshot()
                snapshot.cache_hit = True
            self._cached = snapshot
            self._cached_at = time.monotonic()
            return snapshot

    async def _fetch_snapshot(self) -> ReleaseSnapshot:
        today = date.today()
        source_url = CALENDAR_URL.format(year=today.year, month=today.month)
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36",
            "Accept-Language": "ja,en;q=0.8",
        }
        async with httpx.AsyncClient(headers=headers, timeout=12.0, follow_redirects=True) as client:
            calendar_response = await client.get(source_url)
            calendar_response.raise_for_status()
            candidates = []
            seen_brands: set[str] = set()
            for item in parse_calendar_candidates(calendar_response.text, today.year, today.month):
                brand_key = re.sub(r"\([^)]*\)", "", item["brand"]).strip().lower()
                if brand_key in seen_brands:
                    continue
                seen_brands.add(brand_key)
                candidates.append(item)
                if len(candidates) == 10:
                    break
            if len(candidates) < 5:
                raise RuntimeError("한국 브랜드 신제품 후보가 5개 미만입니다.")
            responses = await asyncio.gather(
                *[client.get(item["product_url"]) for item in candidates],
                return_exceptions=True,
            )

        products: list[ReleaseProduct] = []
        for candidate, response in zip(candidates, responses):
            if isinstance(response, Exception) or response.status_code >= 400:
                continue
            products.append(parse_product_page(response.text, candidate, source_url))
            if len(products) == 5:
                break
        if len(products) < 5:
            raise RuntimeError("신제품 상세 데이터가 5개 미만입니다.")
        return ReleaseSnapshot(
            products=products,
            collected_at=datetime.now(SEOUL).isoformat(timespec="seconds"),
            source_url=source_url,
        )
