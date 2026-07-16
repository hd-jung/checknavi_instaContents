from __future__ import annotations

import asyncio
import re
import time
from datetime import datetime
from typing import Iterable
from urllib.parse import urljoin
from zoneinfo import ZoneInfo

import httpx
from bs4 import BeautifulSoup, Tag

from app.models import RankedProduct, RankingSnapshot


SEOUL = ZoneInfo("Asia/Seoul")
SOURCE_URL = "https://www.cosme.net/categories/pickup/1039/ranking/"

# @cosme의 메이크업/베이스 메이크업 카테고리 중 국내에서 통상
# '색조화장품'으로 분류되는 품목을 포함한다.
CATEGORY_MAP = {
    "アイブロウペンシル": "아이브로우 펜슬",
    "パウダーアイブロウ": "파우더 아이브로우",
    "眉マスカラ": "브로우 마스카라",
    "その他アイブロウ": "기타 아이브로우",
    "リキッドアイライナー": "리퀴드 아이라이너",
    "ペンシルアイライナー": "펜슬 아이라이너",
    "ジェルアイライナー": "젤 아이라이너",
    "その他アイライナー": "기타 아이라이너",
    "マスカラ": "마스카라",
    "マスカラ下地・トップコート": "마스카라 베이스·탑코트",
    "パウダーアイシャドウ": "파우더 아이섀도",
    "ジェル・クリームアイシャドウ": "젤·크림 아이섀도",
    "アイシャドウベース": "아이섀도 베이스",
    "口紅": "립스틱·틴트",
    "リップグロス": "립글로스",
    "リップライナー": "립라이너",
    "パウダーチーク": "파우더 치크",
    "ジェル・クリームチーク": "젤·크림 치크",
    "ハイライト": "하이라이터",
    "シェーディング": "셰이딩",
    "マニキュア": "네일 컬러",
    "ジェルネイル": "젤 네일",
    "ネイルトップ・ベース": "네일 탑·베이스",
    "つけ爪・ネイルチップ": "네일 팁",
    "メイクアップキット・パレット": "메이크업 팔레트",
    "パウダーファンデ": "파우더 파운데이션",
    "リキッドファンデ": "리퀴드 파운데이션",
    "クリーム・ジェルファンデ": "크림·젤 파운데이션",
    "クッションファンデ": "쿠션 파운데이션",
    "その他ファンデーション": "기타 파운데이션",
    "化粧下地": "메이크업 베이스",
    "コンシーラー": "컨실러",
    "ルースパウダー": "루스 파우더",
    "プレストパウダー": "프레스드 파우더",
    "BBクリーム": "BB 크림",
    "CCクリーム": "CC 크림",
}

TREND_MAP = {
    "順位アップ": "up",
    "順位ダウン": "down",
    "順位変わらず": "same",
    "ランキング初登場": "new",
}


def _text(node: Tag | None, default: str = "") -> str:
    return node.get_text(" ", strip=True) if node else default


def _first_number(value: str, default: int = 0) -> int:
    match = re.search(r"[\d,]+", value)
    return int(match.group(0).replace(",", "")) if match else default


def _rank_from_item(item: Tag, page: int, index: int) -> int:
    image = item.select_one(".rank-num img[alt]")
    if image:
        rank = _first_number(str(image.get("alt", "")))
        if rank:
            return rank
    number = item.select_one(".rank-num .num")
    if number:
        return _first_number(_text(number), (page - 1) * 10 + index + 1)
    return (page - 1) * 10 + index + 1


def _trend_from_item(item: Tag) -> str:
    status = item.select_one(".status img[alt]")
    status_text = str(status.get("alt", "")) if status else ""
    return TREND_MAP.get(status_text, "same")


def _matching_category(categories: Iterable[str]) -> tuple[str, str] | None:
    for category in categories:
        if category in CATEGORY_MAP:
            return category, CATEGORY_MAP[category]
    return None


def parse_ranking_page(html: str, page: int = 1) -> tuple[list[RankedProduct], str, str]:
    """Parse one @cosme Korean-cosmetics ranking page.

    Products outside the color/base makeup scope are intentionally excluded.
    Returned ``rank`` values are placeholders and are re-indexed after pages are
    merged; ``source_rank`` always preserves the original @cosme position.
    """

    soup = BeautifulSoup(html, "html.parser")
    header = soup.select_one("#keyword-ranking-header p")
    header_text = _text(header)
    updated_match = re.search(r"更新日[：:]\s*([^\s]+)", header_text)
    period_match = re.search(r"集計期間[：:]\s*(.+)$", header_text)
    updated_date = updated_match.group(1) if updated_match else "확인 불가"
    aggregation_period = period_match.group(1).strip() if period_match else "확인 불가"

    products: list[RankedProduct] = []
    for index, item in enumerate(soup.select("#keyword-ranking-list .keyword-ranking-item")):
        categories_ja = [_text(node) for node in item.select(".summary .category a")]
        match = _matching_category(categories_ja)
        if not match:
            continue
        category_ja, category_ko = match

        name_node = item.select_one(".summary .item a")
        brand_node = item.select_one(".summary .brand a:not(.icon-cmn-tieup)")
        image_node = item.select_one(".pic img")
        rating_node = item.select_one(".reviewer-average")
        reviews_node = item.select_one(".votes .count span")
        price_text = _text(item.select_one(".price")).replace("税込価格：", "")
        award = _text(item.select_one(".keyword-award-caption p")) or None

        if not name_node or not brand_node:
            continue
        product_url = urljoin(SOURCE_URL, str(name_node.get("href", "")))
        image_url = urljoin(SOURCE_URL, str(image_node.get("src", ""))) if image_node else ""
        try:
            rating = float(_text(rating_node, "0"))
        except ValueError:
            rating = 0.0

        source_rank = _rank_from_item(item, page, index)
        products.append(
            RankedProduct(
                rank=0,
                source_rank=source_rank,
                brand=_text(brand_node),
                name=_text(name_node),
                category=category_ko,
                category_ja=category_ja,
                rating=rating,
                reviews=_first_number(_text(reviews_node)),
                price=price_text or "가격 정보 없음",
                image_url=image_url,
                product_url=product_url,
                trend=_trend_from_item(item),
                award=award,
            )
        )
    return products, updated_date, aggregation_period


class CosmeRankingService:
    def __init__(self, ttl_seconds: int = 900, max_pages: int = 5) -> None:
        self.ttl_seconds = ttl_seconds
        self.max_pages = max_pages
        self._cached: RankingSnapshot | None = None
        self._cached_at = 0.0
        self._lock = asyncio.Lock()

    async def get_snapshot(self, force: bool = False) -> RankingSnapshot:
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
                raise
            self._cached = snapshot
            self._cached_at = time.monotonic()
            return snapshot

    async def _fetch_snapshot(self) -> RankingSnapshot:
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36"
            ),
            "Accept-Language": "ja,en;q=0.8",
        }
        limits = httpx.Limits(max_connections=5, max_keepalive_connections=5)
        async with httpx.AsyncClient(
            headers=headers,
            timeout=httpx.Timeout(18.0),
            follow_redirects=True,
            limits=limits,
        ) as client:
            responses = await asyncio.gather(
                *[
                    client.get(SOURCE_URL, params={"page": page} if page > 1 else None)
                    for page in range(1, self.max_pages + 1)
                ]
            )

        all_products: list[RankedProduct] = []
        updated_date = "확인 불가"
        aggregation_period = "확인 불가"
        for page, response in enumerate(responses, start=1):
            response.raise_for_status()
            page_products, page_updated, page_period = parse_ranking_page(response.text, page)
            all_products.extend(page_products)
            if page == 1:
                updated_date = page_updated
                aggregation_period = page_period

        # Keep source order, guard against duplicate products, then derive a
        # color-cosmetics-only ranking from the original @cosme positions.
        seen: set[str] = set()
        unique: list[RankedProduct] = []
        for product in sorted(all_products, key=lambda entry: entry.source_rank):
            if product.product_url in seen:
                continue
            seen.add(product.product_url)
            product.rank = len(unique) + 1
            unique.append(product)
            if len(unique) == 10:
                break

        if len(unique) < 5:
            raise RuntimeError("@cosme에서 색조 랭킹 상품을 충분히 찾지 못했습니다.")

        return RankingSnapshot(
            products=unique,
            updated_date=updated_date,
            aggregation_period=aggregation_period,
            collected_at=datetime.now(SEOUL).isoformat(timespec="seconds"),
            source_url=SOURCE_URL,
        )
