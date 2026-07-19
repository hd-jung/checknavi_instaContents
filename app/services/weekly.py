from __future__ import annotations

import asyncio
import time
from dataclasses import asdict, dataclass
from datetime import datetime
from zoneinfo import ZoneInfo

import httpx
from bs4 import BeautifulSoup

from app.data.fallback_weekly import FALLBACK_WEEKLY
from app.services.cosme import (
    SOURCE_URL,
    _first_number,
    _rank_from_item,
    _text,
    _trend_from_item,
)


SEOUL = ZoneInfo("Asia/Seoul")


GROUPS = [
    {
        "key": "skincare",
        "label": "기초케어",
        "eyebrow": "SKINCARE",
        "description": "피부 컨디션을 끌어올린 이번 주의 기본",
        "theme": ["#dfff49", "#fff8d6"],
        "categories": {
            "化粧水", "ミスト状化粧水", "ブースター・導入液", "美容液", "乳液",
            "フェイスクリーム", "フェイスオイル・バーム", "オールインワン化粧品",
            "アイケア・アイクリーム", "まつげ美容液", "リップケア・リップクリーム",
        },
    },
    {
        "key": "color",
        "label": "포인트 색조",
        "eyebrow": "COLOR MAKEUP",
        "description": "눈과 입술에 지금 가장 많이 담긴 컬러",
        "theme": ["#ff715b", "#ffd3cc"],
        "categories": {
            "アイブロウペンシル", "パウダーアイブロウ", "眉マスカラ", "その他アイブロウ",
            "リキッドアイライナー", "ペンシルアイライナー", "ジェルアイライナー",
            "その他アイライナー", "マスカラ", "マスカラ下地・トップコート",
            "パウダーアイシャドウ", "ジェル・クリームアイシャドウ", "アイシャドウベース",
            "口紅", "リップグロス", "リップライナー", "パウダーチーク",
            "ジェル・クリームチーク", "ハイライト", "シェーディング",
        },
    },
    {
        "key": "mask",
        "label": "시트마스크",
        "eyebrow": "SPECIAL CARE",
        "description": "짧은 시간, 확실한 루틴을 만든 스페셜 케어",
        "theme": ["#c9b9ff", "#eee9ff"],
        "categories": {"シートマスク・パック", "洗い流すパック・マスク", "スリーピングマスク・パック"},
    },
    {
        "key": "suncare",
        "label": "선케어",
        "eyebrow": "SUN CARE",
        "description": "자외선과 메이크업 지속력을 함께 잡는 선택",
        "theme": ["#ffca4b", "#fff2c5"],
        "categories": {"日焼け止め・UVケア(顔用)", "日焼け止め・UVケア(ボディ用)"},
    },
    {
        "key": "base",
        "label": "베이스 메이크업",
        "eyebrow": "BASE MAKEUP",
        "description": "결과 톤을 정돈하는 이번 주의 베이스",
        "theme": ["#74b9ff", "#dceeff"],
        "categories": {
            "パウダーファンデ", "リキッドファンデ", "リキッドファンデーション",
            "クリーム・ジェルファンデ", "クッションファンデ", "その他ファンデーション",
            "化粧下地", "コンシーラー", "ルースパウダー", "プレストパウダー",
            "BBクリーム", "CCクリーム",
        },
    },
]


@dataclass(slots=True)
class WeeklyPick:
    group_key: str
    group_label: str
    eyebrow: str
    description: str
    theme: list[str]
    source_rank: int
    brand: str
    name: str
    category: str
    rating: float
    reviews: int
    price: str
    image_url: str
    product_url: str
    trend: str
    award: str | None

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass(slots=True)
class WeeklySnapshot:
    picks: list[WeeklyPick]
    updated_date: str
    aggregation_period: str
    collected_at: str
    source_url: str
    cache_hit: bool = False
    fallback: bool = False


def fallback_weekly_snapshot() -> WeeklySnapshot:
    """Return a bundled last known-good snapshot for upstream outages."""
    return WeeklySnapshot(
        picks=[WeeklyPick(**item) for item in FALLBACK_WEEKLY["picks"]],
        updated_date=FALLBACK_WEEKLY["updated_date"],
        aggregation_period=FALLBACK_WEEKLY["aggregation_period"],
        collected_at=datetime.now(SEOUL).isoformat(timespec="seconds"),
        source_url=SOURCE_URL,
        cache_hit=True,
        fallback=True,
    )


def classify_group(categories: list[str]) -> dict | None:
    """Classify by a stable priority so multi-category products are not duplicated."""
    category_set = set(categories)
    # Special-care and sun items should not also consume skincare/base slots.
    priority = ["mask", "suncare", "base", "color", "skincare"]
    by_key = {group["key"]: group for group in GROUPS}
    for key in priority:
        group = by_key[key]
        if category_set & group["categories"]:
            return group
    return None


def parse_weekly_page(html: str, page: int = 1) -> tuple[list[WeeklyPick], str, str]:
    soup = BeautifulSoup(html, "html.parser")
    header_text = _text(soup.select_one("#keyword-ranking-header p"))
    updated_date = "확인 불가"
    aggregation_period = "확인 불가"
    if "更新日：" in header_text:
        updated_date = header_text.split("更新日：", 1)[1].split("集計期間", 1)[0].strip()
    if "集計期間：" in header_text:
        aggregation_period = header_text.split("集計期間：", 1)[1].strip()

    rows: list[WeeklyPick] = []
    for index, item in enumerate(soup.select("#keyword-ranking-list .keyword-ranking-item")):
        categories = [_text(node) for node in item.select(".summary .category a")]
        group = classify_group(categories)
        if not group:
            continue

        name_node = item.select_one(".summary .item a")
        brand_node = item.select_one(".summary .brand a:not(.icon-cmn-tieup)")
        image_node = item.select_one(".pic img")
        if not name_node or not brand_node:
            continue
        try:
            rating = float(_text(item.select_one(".reviewer-average"), "0"))
        except ValueError:
            rating = 0.0

        rows.append(
            WeeklyPick(
                group_key=group["key"],
                group_label=group["label"],
                eyebrow=group["eyebrow"],
                description=group["description"],
                theme=group["theme"],
                source_rank=_rank_from_item(item, page, index),
                brand=_text(brand_node),
                name=_text(name_node),
                category=" · ".join(categories),
                rating=rating,
                reviews=_first_number(_text(item.select_one(".votes .count span"))),
                price=_text(item.select_one(".price")).replace("税込価格：", "") or "가격 정보 없음",
                image_url=str(image_node.get("src", "")) if image_node else "",
                product_url=str(name_node.get("href", "")),
                trend=_trend_from_item(item),
                award=_text(item.select_one(".keyword-award-caption p")) or None,
            )
        )
    return rows, updated_date, aggregation_period


class WeeklyRankingService:
    def __init__(self, ttl_seconds: int = 900, max_pages: int = 5) -> None:
        self.ttl_seconds = ttl_seconds
        self.max_pages = max_pages
        self._cached: WeeklySnapshot | None = None
        self._cached_at = 0.0
        self._lock = asyncio.Lock()

    async def get_snapshot(self, force: bool = False) -> WeeklySnapshot:
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
                snapshot = await self._fetch_snapshot()
            except Exception:
                if self._cached:
                    self._cached.cache_hit = True
                    return self._cached
                snapshot = fallback_weekly_snapshot()
            self._cached = snapshot
            self._cached_at = time.monotonic()
            return snapshot

    async def _fetch_snapshot(self) -> WeeklySnapshot:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36",
            "Accept-Language": "ja,en;q=0.8",
        }
        async with httpx.AsyncClient(headers=headers, timeout=25.0, follow_redirects=True) as client:
            responses = await asyncio.gather(
                *[
                    client.get(SOURCE_URL, params={"page": page} if page > 1 else None)
                    for page in range(1, self.max_pages + 1)
                ],
                return_exceptions=True,
            )

        rows: list[WeeklyPick] = []
        updated_date = "확인 불가"
        aggregation_period = "확인 불가"
        for page, response in enumerate(responses, start=1):
            if isinstance(response, Exception):
                continue
            response.raise_for_status()
            page_rows, page_updated, page_period = parse_weekly_page(response.text, page)
            rows.extend(page_rows)
            if page == 1:
                updated_date = page_updated
                aggregation_period = page_period

        picks: list[WeeklyPick] = []
        for group in GROUPS:
            match = next(
                (row for row in sorted(rows, key=lambda item: item.source_rank) if row.group_key == group["key"]),
                None,
            )
            if match:
                picks.append(match)
        if len(picks) != len(GROUPS):
            missing = {group["key"] for group in GROUPS} - {pick.group_key for pick in picks}
            raise RuntimeError(f"주간 카테고리 상품이 부족합니다: {', '.join(sorted(missing))}")

        return WeeklySnapshot(
            picks=picks,
            updated_date=updated_date,
            aggregation_period=aggregation_period,
            collected_at=datetime.now(SEOUL).isoformat(timespec="seconds"),
            source_url=SOURCE_URL,
        )
