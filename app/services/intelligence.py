from __future__ import annotations

import re
from datetime import datetime
from zoneinfo import ZoneInfo

from app.data.fallback_intelligence import KOREA_REFERENCE_PICKS, OLIVEYOUNG_SOURCE_URL
from app.models import ExchangeRate
from app.services.weekly import WeeklySnapshot


SEOUL = ZoneInfo("Asia/Seoul")


def _first_jpy(price_text: str) -> int | None:
    match = re.search(r"([\d,]+)\s*円", price_text or "")
    return int(match.group(1).replace(",", "")) if match else None


def _jpy_from_krw(price_krw: int | None, rate: float | None) -> int | None:
    if not price_krw or not rate:
        return None
    return round(price_krw * rate / 100)


def _krw_from_jpy(price_jpy: int | None, rate: float | None) -> int | None:
    if not price_jpy or not rate:
        return None
    return round(price_jpy * 100 / rate)


def _discount_rate(list_price: int, sale_price: int) -> int:
    if not list_price or sale_price >= list_price:
        return 0
    return round((1 - sale_price / list_price) * 100)


def build_market_intelligence(snapshot: WeeklySnapshot, exchange: ExchangeRate) -> dict:
    rate = exchange.rate_per_100_krw
    japan_by_key = {pick.group_key: pick for pick in snapshot.picks}
    comparisons: list[dict] = []
    top5: list[dict] = []

    insight_copy = {
        "skincare": (
            "PDRN 집중 vs 수분 장벽 확장",
            "일본은 대형 리뷰가 쌓인 PDRN 세럼에 집중되어 있고, 한국 쪽은 사용 빈도가 높은 수분 크림이 다음 확장 축입니다.",
        ),
        "color": (
            "브로우 고정 수요 vs 룩 전체 제안",
            "일본의 현재 상위권은 브로우처럼 익숙한 단품이 강하고, 한국 후보는 한 팔레트로 룩을 완성하는 방향입니다.",
        ),
        "mask": (
            "PDRN 보습 vs 흔적 진정",
            "같은 시트 마스크 안에서도 일본은 PDRN, 한국 후보는 마데카소사이드 흔적 케어로 메시지가 갈립니다.",
        ),
        "suncare": (
            "톤업 크림 vs 투명 선 세럼",
            "일본의 톤업 수요와 한국의 수분 세럼 제형을 대비하면 ‘다음 사용감’ 콘텐츠가 선명해집니다.",
        ),
        "base": (
            "보송 피니시 vs 글로우 베이스",
            "일본의 파우더 마무리와 한국의 글로우 쿠션을 비교하면 서로 다른 피부 표현 트렌드가 드러납니다.",
        ),
    }

    for index, korea in enumerate(KOREA_REFERENCE_PICKS, start=1):
        japan = japan_by_key.get(korea["category_key"])
        if not japan:
            continue
        jp_price = _first_jpy(japan.price)
        converted_sale_jpy = _jpy_from_krw(korea["sale_price_krw"], rate)
        converted_list_jpy = _jpy_from_krw(korea["price_krw"], rate)
        discount = _discount_rate(korea["price_krw"], korea["sale_price_krw"])
        headline, reason = insight_copy[korea["category_key"]]
        opportunity_score = min(
            98,
            63
            + discount
            + (7 if korea["release_stage"] == "한국 신규 주목" else 3)
            + (4 if japan.reviews >= 5000 else 0),
        )

        japan_payload = {
            "rank": japan.source_rank,
            "brand": japan.brand,
            "name": japan.name,
            "seller": "@cosme / 일본 취급점",
            "price_text": japan.price,
            "price_jpy": jp_price,
            "converted_krw": _krw_from_jpy(jp_price, rate),
            "rating": japan.rating,
            "reviews": japan.reviews,
            "image_url": japan.image_url,
            "brand_logo_url": "",
            "product_url": japan.product_url,
            "category": japan.category,
            "stage": "일본 현재 인기",
        }
        korea_payload = {
            **korea,
            "converted_list_jpy": converted_list_jpy,
            "converted_sale_jpy": converted_sale_jpy,
            "discount_rate": discount,
            "reviews_status": "Olive Young 서버 수집 대기" if korea["reviews"] is None else None,
        }
        comparison = {
            "category_key": korea["category_key"],
            "category_label": korea["category_label"],
            "category_detail": korea["category_detail"],
            "japan": japan_payload,
            "korea": korea_payload,
            "insight": {
                "headline": headline,
                "reason": reason,
                "opportunity_score": opportunity_score,
                "label": "JAPAN ENTRY SIGNAL",
            },
        }
        comparisons.append(comparison)
        top5.append(
            {
                "position": index,
                "opportunity_score": opportunity_score,
                "category_key": korea["category_key"],
                "category_label": korea["category_label"],
                "product": korea_payload,
                "japan_counterpart": japan_payload,
                "price_analysis": {
                    "kr_list_price": korea["price_krw"],
                    "kr_sale_price": korea["sale_price_krw"],
                    "converted_list_jpy": converted_list_jpy,
                    "converted_sale_jpy": converted_sale_jpy,
                    "japan_counterpart_jpy": jp_price,
                    "discount_rate": discount,
                    "buy_signal": discount >= 20,
                    "default_threshold": 20,
                },
                "performance": {
                    "ingredients": korea["ingredients"],
                    "claims": korea["claims"],
                    "appeal": korea["appeal"],
                    "model": korea["model"],
                },
                "news_signals": [
                    korea["news_signal"],
                    f"{korea['release_stage']} · {korea['category_detail']}",
                ],
            }
        )

    top5.sort(key=lambda item: item["opportunity_score"], reverse=True)
    for position, item in enumerate(top5, start=1):
        item["position"] = position

    japan_mode = "fallback" if snapshot.fallback else ("cached" if snapshot.cache_hit else "live")
    return {
        "status": "ok",
        "collected_at": datetime.now(SEOUL).isoformat(timespec="seconds"),
        "sources": {
            "japan": {
                "name": "@cosme 한국 코스메 랭킹",
                "mode": japan_mode,
                "updated_date": snapshot.updated_date,
                "aggregation_period": snapshot.aggregation_period,
                "url": snapshot.source_url,
            },
            "korea": {
                "name": "Olive Young 랭킹 + Global 상품 정보",
                "mode": "reference_snapshot",
                "updated_date": "2026-07-20",
                "url": OLIVEYOUNG_SOURCE_URL,
                "note": "공식 랭킹의 서버 접속 제한으로 검증된 최근 스냅샷 사용 중",
            },
            "news": {
                "name": "공식 상품·브랜드 페이지",
                "mode": "verified_reference",
                "updated_date": "2026-07-20",
            },
        },
        "exchange": {
            "rate_per_100_krw": rate,
            "as_of_date": exchange.as_of_date,
            "collected_at": exchange.collected_at,
            "source_url": exchange.source_url,
            "error": exchange.error,
        },
        "summary": {
            "categories": len(comparisons),
            "top5": len(top5),
            "average_opportunity_score": round(
                sum(item["opportunity_score"] for item in top5) / len(top5)
            )
            if top5
            else 0,
            "new_wave_count": sum(
                1 for item in top5 if item["product"]["release_stage"] == "한국 신규 주목"
            ),
        },
        "comparisons": comparisons,
        "top5": top5,
        "methodology": [
            "일본: @cosme 한국 코스메 주간 랭킹의 카테고리별 최상위 제품",
            "한국: Olive Young 공식 랭킹 노출 및 Global 공식 상품 페이지 검증",
            "기회점수: 한국 할인율, 신규성, 일본 기존 제품의 리뷰 축적도를 조합한 편집 우선순위",
            "‘일본 현재 인기’는 낡았다는 단정이 아니라 리뷰와 랭크가 축적된 성숙 신호를 뜻함",
        ],
    }
