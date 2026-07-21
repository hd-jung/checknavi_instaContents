from __future__ import annotations

import asyncio
import json
import time
from dataclasses import asdict, dataclass
from datetime import datetime
from zoneinfo import ZoneInfo

import httpx
from bs4 import BeautifulSoup


SEOUL = ZoneInfo("Asia/Seoul")
SOURCE_URL = "https://www.hwahae.co.kr/rankings"

# Five detailed Korean categories aligned with the five @cosme groups already
# collected by WeeklyRankingService.
CATEGORY_SPECS = [
    {
        "key": "skincare",
        "theme_id": 4174,
        "label": "에센스·앰플·세럼",
        "path": "스킨케어 > 에센스/앰플/세럼",
    },
    {
        "key": "color",
        "theme_id": 4380,
        "label": "아이브로우",
        "path": "아이메이크업 > 아이브로우",
    },
    {
        "key": "mask",
        "theme_id": 4217,
        "label": "시트마스크",
        "path": "마스크/팩 > 시트마스크",
    },
    {
        "key": "suncare",
        "theme_id": 4272,
        "label": "선크림·로션",
        "path": "선케어 > 선크림/로션",
    },
    {
        "key": "base",
        "theme_id": 4333,
        "label": "파우더·팩트",
        "path": "베이스메이크업 > 파우더/팩트",
    },
]


@dataclass(slots=True)
class HwahaeProduct:
    category_key: str
    category_label: str
    category_detail: str
    rank: int
    brand: str
    brand_id: int | None
    name: str
    product_id: int
    seller: str
    list_price_krw: int | None
    sale_price_krw: int | None
    discount_rate: int | None
    rating: float | None
    reviews: int | None
    image_url: str
    product_url: str
    purchase_url: str | None
    package_info: str | None
    performance_topics: list[str]
    performance_evidence: list[dict]
    ingredients: list[str]
    ingredients_status: str
    model: str | None
    model_status: str
    rank_delta: int
    is_rank_new: bool

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass(slots=True)
class HwahaeSnapshot:
    products: list[HwahaeProduct]
    updated_date: str
    collected_at: str
    source_url: str
    cache_hit: bool = False
    fallback: bool = False


FALLBACK_PRODUCTS = [
    {
        "category_key": "skincare", "category_label": "에센스·앰플·세럼", "category_detail": "스킨케어 > 에센스/앰플/세럼",
        "rank": 1, "brand": "토리든", "brand_id": 3264, "name": "다이브인 저분자 히알루론산 세럼", "product_id": 1984011,
        "seller": "화해 쇼핑", "list_price_krw": 44098, "sale_price_krw": 26900, "discount_rate": 39,
        "rating": 4.61, "reviews": 84147, "image_url": "https://img.hwahae.co.kr/commerce/goods/20260601_142226_composed-represent.png",
        "product_url": "https://www.hwahae.co.kr/products/1984011", "purchase_url": "https://www.hwahae.co.kr/goods/54413",
        "package_info": "세럼 100ml + 수딩크림 20ml × 3", "performance_topics": ["유분이 없어요", "속건조에 효과 있어요", "산뜻해요"],
        "performance_evidence": [{"label": "유분이 없어요", "positive": True, "review_count": 3078}, {"label": "속건조에 효과 있어요", "positive": True, "review_count": 10259}, {"label": "산뜻해요", "positive": True, "review_count": 3249}],
    },
    {
        "category_key": "color", "category_label": "아이브로우", "category_detail": "아이메이크업 > 아이브로우",
        "rank": 1, "brand": "이니스프리", "brand_id": 20, "name": "납작 아이브로우 펜슬 [4 새벽 이슬 애쉬 브라운]", "product_id": 1998022,
        "seller": "화해 쇼핑", "list_price_krw": 5500, "sale_price_krw": 5500, "discount_rate": 0,
        "rating": 4.69, "reviews": 259, "image_url": "https://img.hwahae.co.kr/commerce/goods/20240528_131724_%ED%99%94%ED%95%B4_131174468_01.jpg",
        "product_url": "https://www.hwahae.co.kr/products/1998022", "purchase_url": "https://www.hwahae.co.kr/goods/62796",
        "package_info": "0.3g", "performance_topics": ["자연스러워요", "색감이 좋아요", "잘 그려져요"],
        "performance_evidence": [{"label": "자연스러워요", "positive": True, "review_count": 108}, {"label": "색감이 좋아요", "positive": True, "review_count": 75}, {"label": "잘 그려져요", "positive": True, "review_count": 113}],
    },
    {
        "category_key": "mask", "category_label": "시트마스크", "category_detail": "마스크/팩 > 시트마스크",
        "rank": 1, "brand": "메디힐", "brand_id": 757, "name": "마데카소사이드 에센셜 마스크 [흔적리페어]", "product_id": 2107391,
        "seller": "화해 쇼핑", "list_price_krw": 39800, "sale_price_krw": 19900, "discount_rate": 50,
        "rating": 4.70, "reviews": 7154, "image_url": "https://img.hwahae.co.kr/commerce/goods/20260324_154946_composed-represent.png",
        "product_url": "https://www.hwahae.co.kr/products/2107391", "purchase_url": "https://www.hwahae.co.kr/goods/64587",
        "package_info": "24ml × 20매", "performance_topics": ["트러블이 없어져요", "진정이 잘 돼요", "에센스 양이 많아요"],
        "performance_evidence": [{"label": "트러블이 없어져요", "positive": True, "review_count": 1109}, {"label": "진정이 잘 돼요", "positive": True, "review_count": 2193}, {"label": "에센스 양이 많아요", "positive": True, "review_count": 1543}],
    },
    {
        "category_key": "suncare", "category_label": "선크림·로션", "category_detail": "선케어 > 선크림/로션",
        "rank": 1, "brand": "라운드랩", "brand_id": 3897, "name": "자작나무 수분 선크림 [SPF50+/PA++++]", "product_id": 1920665,
        "seller": "화해 쇼핑", "list_price_krw": 24844, "sale_price_krw": 15900, "discount_rate": 36,
        "rating": 4.60, "reviews": 29615, "image_url": "https://img.hwahae.co.kr/commerce/goods/20260406_130419_LSC50-B1%20(1).jpg",
        "product_url": "https://www.hwahae.co.kr/products/1920665", "purchase_url": "https://www.hwahae.co.kr/goods/42771",
        "package_info": "50ml", "performance_topics": ["산뜻해요", "답답하지 않아요", "가벼워요"],
        "performance_evidence": [{"label": "산뜻해요", "positive": True, "review_count": 1021}, {"label": "답답하지 않아요", "positive": True, "review_count": 881}, {"label": "가벼워요", "positive": True, "review_count": 2709}],
    },
    {
        "category_key": "base", "category_label": "파우더·팩트", "category_detail": "베이스메이크업 > 파우더/팩트",
        "rank": 1, "brand": "이니스프리", "brand_id": 20, "name": "(리뉴얼)노세범 미네랄 파우더", "product_id": 1925669,
        "seller": "화해 쇼핑", "list_price_krw": 9000, "sale_price_krw": 6750, "discount_rate": 25,
        "rating": 4.72, "reviews": 3887, "image_url": "https://img.hwahae.co.kr/commerce/goods/20230227_120059_2.jpg",
        "product_url": "https://www.hwahae.co.kr/products/1925669", "purchase_url": "https://www.hwahae.co.kr/goods/49256",
        "package_info": "5g", "performance_topics": ["뽀송해요", "유분이 없어요", "트러블이 안 생겨요"],
        "performance_evidence": [{"label": "뽀송해요", "positive": True, "review_count": 607}, {"label": "유분이 없어요", "positive": True, "review_count": 1679}, {"label": "트러블이 안 생겨요", "positive": True, "review_count": 122}],
    },
]


def fallback_hwahae_snapshot() -> HwahaeSnapshot:
    common = {
        "ingredients": [],
        "ingredients_status": "공식 상세 페이지의 전성분은 현재 서버 응답에서 제공되지 않습니다.",
        "model": None,
        "model_status": "공식 모델·앰버서더 연결 정보는 랭킹 원본에 없습니다.",
        "rank_delta": 0,
        "is_rank_new": False,
    }
    return HwahaeSnapshot(
        products=[HwahaeProduct(**{**common, **item}) for item in FALLBACK_PRODUCTS],
        updated_date="2026.07.16. 업데이트",
        collected_at=datetime.now(SEOUL).isoformat(timespec="seconds"),
        source_url=f"{SOURCE_URL}?english_name=category&theme_id=2",
        cache_hit=True,
        fallback=True,
    )


def _derived_list_price(sale_price: int | None, discount_rate: int | None) -> int | None:
    if not sale_price:
        return None
    if not discount_rate or discount_rate <= 0 or discount_rate >= 100:
        return sale_price
    return round(sale_price / (1 - discount_rate / 100))


def parse_hwahae_page(html: str, spec: dict) -> tuple[HwahaeProduct, str]:
    soup = BeautifulSoup(html, "html.parser")
    next_data = soup.find("script", id="__NEXT_DATA__")
    if not next_data:
        raise RuntimeError("화해 랭킹 데이터가 HTML에 없습니다.")

    payload = json.loads(next_data.get_text())
    ranking_products = payload["props"]["pageProps"]["rankingProducts"]
    source_data = ranking_products["data"]
    details = source_data.get("details") or []
    if not details:
        raise RuntimeError(f"화해 {spec['label']} 랭킹에 상품이 없습니다.")

    detail = details[0]
    product = detail.get("product") or {}
    goods = detail.get("goods") or {}
    brand = detail.get("brand") or {}
    topics = product.get("product_topics") or []
    evidence = []
    for topic in topics[:5]:
        review_topic = topic.get("review_topic") or {}
        sentence = review_topic.get("sentence") or review_topic.get("name")
        if not sentence:
            continue
        evidence.append(
            {
                "label": sentence,
                "positive": bool(topic.get("is_positive", True)),
                "review_count": int(topic.get("review_count") or 0),
            }
        )

    sale_price = goods.get("price") or product.get("price")
    discount_rate = goods.get("discount_rate")
    if discount_rate is None:
        discount_rate = 0
    goods_id = goods.get("id")
    product_id = int(product["id"])
    meta = source_data.get("meta") or {}
    updated_date = meta.get("last_updated_at_description") or meta.get("last_updated_at") or "확인 불가"

    return (
        HwahaeProduct(
            category_key=spec["key"],
            category_label=spec["label"],
            category_detail=spec["path"],
            rank=1,
            brand=brand.get("name") or "브랜드 확인 불가",
            brand_id=brand.get("id"),
            name=product.get("name") or goods.get("name") or "상품명 확인 불가",
            product_id=product_id,
            seller="화해 쇼핑" if goods_id else "화해 상품 정보",
            list_price_krw=_derived_list_price(sale_price, discount_rate),
            sale_price_krw=sale_price,
            discount_rate=int(discount_rate),
            rating=product.get("review_rating"),
            reviews=product.get("review_count"),
            image_url=goods.get("image_url") or product.get("image_url") or "",
            product_url=f"https://www.hwahae.co.kr/products/{product_id}",
            purchase_url=f"https://www.hwahae.co.kr/goods/{goods_id}" if goods_id else None,
            package_info=goods.get("capacity") or product.get("package_info"),
            performance_topics=[entry["label"] for entry in evidence],
            performance_evidence=evidence,
            ingredients=[],
            ingredients_status="공식 상세 페이지의 전성분은 현재 서버 응답에서 제공되지 않습니다.",
            model=None,
            model_status="공식 모델·앰버서더 연결 정보는 랭킹 원본에 없습니다.",
            rank_delta=int(detail.get("rank_delta") or 0),
            is_rank_new=bool(detail.get("is_rank_new", False)),
        ),
        updated_date,
    )


class HwahaeRankingService:
    def __init__(self, ttl_seconds: int = 900) -> None:
        self.ttl_seconds = ttl_seconds
        self._cached: HwahaeSnapshot | None = None
        self._cached_at = 0.0
        self._lock = asyncio.Lock()

    async def get_snapshot(self, force: bool = False) -> HwahaeSnapshot:
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
                return fallback_hwahae_snapshot()
            self._cached = snapshot
            self._cached_at = time.monotonic()
            return snapshot

    async def _fetch_snapshot(self) -> HwahaeSnapshot:
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36"
            ),
            "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.5",
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
                    client.get(
                        SOURCE_URL,
                        params={"english_name": "category", "theme_id": spec["theme_id"]},
                    )
                    for spec in CATEGORY_SPECS
                ]
            )

        products: list[HwahaeProduct] = []
        updated_dates: list[str] = []
        for spec, response in zip(CATEGORY_SPECS, responses, strict=True):
            response.raise_for_status()
            product, updated_date = parse_hwahae_page(response.text, spec)
            products.append(product)
            updated_dates.append(updated_date)

        return HwahaeSnapshot(
            products=products,
            updated_date=updated_dates[0] if len(set(updated_dates)) == 1 else " / ".join(updated_dates),
            collected_at=datetime.now(SEOUL).isoformat(timespec="seconds"),
            source_url=f"{SOURCE_URL}?english_name=category&theme_id=2",
        )
