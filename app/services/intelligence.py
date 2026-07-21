from __future__ import annotations

import re
from datetime import datetime
from urllib.parse import quote
from zoneinfo import ZoneInfo

from app.models import ExchangeRate
from app.services.hwahae import HwahaeSnapshot
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


def _wordmark_url(brand: str) -> str:
    return f"/api/brand-wordmark?name={quote(brand)}"


def _source_mode(snapshot) -> str:
    if snapshot.fallback:
        return "fallback"
    return "cached" if snapshot.cache_hit else "live"


def _field_status(value, note: str | None = None) -> dict:
    return {"available": value not in (None, "", []), "note": note}


def build_market_intelligence(
    japan_snapshot: WeeklySnapshot,
    korea_snapshot: HwahaeSnapshot,
    exchange: ExchangeRate,
) -> dict:
    rate = exchange.rate_per_100_krw
    japan_by_key = {pick.group_key: pick for pick in japan_snapshot.picks}
    comparisons: list[dict] = []
    top5: list[dict] = []

    for korea in korea_snapshot.products:
        japan = japan_by_key.get(korea.category_key)
        if not japan:
            continue

        jp_price = _first_jpy(japan.price)
        jp_converted_krw = _krw_from_jpy(jp_price, rate)
        kr_list_jpy = _jpy_from_krw(korea.list_price_krw, rate)
        kr_sale_jpy = _jpy_from_krw(korea.sale_price_krw, rate)
        established_signal = japan.reviews >= 5000
        score = min(
            98,
            58
            + min(18, (korea.discount_rate or 0) // 3)
            + (8 if established_signal else 3)
            + (8 if korea.reviews and korea.reviews >= 5000 else 4)
            + (4 if korea.is_rank_new else 0),
        )

        japan_payload = {
            "rank": japan.source_rank,
            "brand": japan.brand,
            "name": japan.name,
            "seller": "@cosme 상품 정보 / 일본 취급점",
            "price_text": japan.price,
            "price_jpy": jp_price,
            "converted_krw": jp_converted_krw,
            "rating": japan.rating,
            "reviews": japan.reviews,
            "image_url": japan.image_url,
            "brand_logo_url": _wordmark_url(japan.brand),
            "brand_logo_kind": "generated_wordmark",
            "product_url": japan.product_url,
            "category": japan.category,
            "category_detail": japan.category,
            "source_name": "@cosme 한국 코스메 주간 랭킹",
            "source_updated_at": japan_snapshot.updated_date,
            "data_mode": _source_mode(japan_snapshot),
            "required_fields": {
                "name": _field_status(japan.name),
                "photo": _field_status(japan.image_url),
                "brand_logo": _field_status(True, "공식 로고 파일이 없어 브랜드 워드마크로 표시"),
                "seller": _field_status(True),
                "fx_price": _field_status(jp_converted_krw),
                "reviews_rating": _field_status(japan.rating is not None and japan.reviews is not None),
            },
        }

        korea_payload = {
            **korea.to_dict(),
            "price_krw": korea.list_price_krw,
            "converted_list_jpy": kr_list_jpy,
            "converted_sale_jpy": kr_sale_jpy,
            "brand_logo_url": _wordmark_url(korea.brand),
            "brand_logo_kind": "generated_wordmark",
            "source_name": "화해 카테고리별 랭킹",
            "source_updated_at": korea_snapshot.updated_date,
            "data_mode": _source_mode(korea_snapshot),
            "release_stage": "한국 카테고리 1위",
            "required_fields": {
                "name": _field_status(korea.name),
                "photo": _field_status(korea.image_url),
                "brand_logo": _field_status(True, "공식 로고 파일이 없어 브랜드 워드마크로 표시"),
                "seller": _field_status(korea.seller),
                "fx_price": _field_status(kr_sale_jpy),
                "reviews_rating": _field_status(korea.rating is not None and korea.reviews is not None),
            },
        }

        topic_copy = " · ".join(korea.performance_topics[:3]) or "리뷰 성능 키워드 확인 필요"
        comparison = {
            "category_key": korea.category_key,
            "category_label": korea.category_label,
            "category_detail": korea.category_detail,
            "japan": japan_payload,
            "korea": korea_payload,
            "insight": {
                "headline": "일본 정착형 수요에 한국 1위 제품을 대안으로 제안",
                "reason": (
                    f"@cosme 제품은 리뷰 {japan.reviews:,}건으로 일본 내 누적 수요가 확인됩니다. "
                    f"화해 1위 제품의 리뷰 근거는 ‘{topic_copy}’입니다. 오래됐다고 단정하지 않고, "
                    "익숙한 수요를 새 한국 제품 제안으로 전환할 수 있는지를 보여줍니다."
                ),
                "opportunity_score": score,
                "label": "EDITORIAL PRIORITY",
                "established_market": established_signal,
            },
        }
        comparisons.append(comparison)

        japan_sale_discount = None
        top5.append(
            {
                "position": 0,
                "opportunity_score": score,
                "category_key": korea.category_key,
                "category_label": korea.category_label,
                "product": korea_payload,
                "japan_counterpart": japan_payload,
                "price_analysis": {
                    "kr_list_price": korea.list_price_krw,
                    "kr_sale_price": korea.sale_price_krw,
                    "converted_list_jpy": kr_list_jpy,
                    "converted_sale_jpy": kr_sale_jpy,
                    "korea_discount_rate": korea.discount_rate,
                    "japan_reference_jpy": jp_price,
                    "japan_reference_krw": jp_converted_krw,
                    "japan_list_price_jpy": jp_price,
                    "japan_sale_price_jpy": None,
                    "japan_discount_rate": japan_sale_discount,
                    "buy_signal": None,
                    "buy_signal_label": "판정 보류 · 일본 정가와 실판매가가 동시에 수집되지 않음",
                    "default_threshold": 20,
                    "threshold_market": "japan",
                },
                "performance": {
                    "ingredients": korea.ingredients,
                    "ingredients_status": korea.ingredients_status,
                    "claims": korea.performance_topics,
                    "evidence": korea.performance_evidence,
                    "appeal": (
                        f"화해 실사용자 리뷰에서 ‘{topic_copy}’가 주요 성능 신호로 잡혔습니다. "
                        "광고 문구로 확정하기 전 브랜드의 공식 효능 자료와 전성분을 추가 검증해야 합니다."
                    ),
                    "model": korea.model,
                    "model_status": korea.model_status,
                },
                "news_signals": [
                    f"화해 {korea.category_label} 랭킹 1위",
                    f"할인율 {korea.discount_rate}%" if korea.discount_rate is not None else "할인 정보 없음",
                ],
            }
        )

    top5.sort(key=lambda item: item["opportunity_score"], reverse=True)
    for position, item in enumerate(top5[:5], start=1):
        item["position"] = position
    top5 = top5[:5]

    return {
        "status": "ok",
        "collected_at": datetime.now(SEOUL).isoformat(timespec="seconds"),
        "sources": {
            "japan": {
                "name": "@cosme 한국 코스메 주간 랭킹",
                "mode": _source_mode(japan_snapshot),
                "updated_date": japan_snapshot.updated_date,
                "aggregation_period": japan_snapshot.aggregation_period,
                "collected_at": japan_snapshot.collected_at,
                "url": japan_snapshot.source_url,
            },
            "korea": {
                "name": "화해 카테고리별 랭킹",
                "mode": _source_mode(korea_snapshot),
                "updated_date": korea_snapshot.updated_date,
                "aggregation_period": "화해가 공개한 최신 카테고리 랭킹",
                "collected_at": korea_snapshot.collected_at,
                "url": korea_snapshot.source_url,
                "note": "올리브영 국내 랭킹은 서버 접근이 차단되어, 서버 수집 가능한 한국 공식 랭킹인 화해를 사용합니다.",
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
            "average_opportunity_score": round(sum(item["opportunity_score"] for item in top5) / len(top5)) if top5 else 0,
            "new_wave_count": sum(1 for item in top5 if item["product"]["is_rank_new"]),
        },
        "comparisons": comparisons,
        "top5": top5,
        "methodology": [
            "일본: @cosme 한국 코스메 주간 랭킹 TOP 50에서 대응 세부 카테고리의 최상위 제품을 선택",
            "한국: 화해의 에센스·앰플·세럼, 아이브로우, 시트마스크, 선크림·로션, 파우더·팩트 최신 카테고리 랭킹 1위",
            "환율: 조회 시점의 원·엔 기준환율로 양국 가격을 상호 환산",
            "일본 할인 BUY 신호는 일본 정가와 실판매가가 모두 있을 때만 계산하며, 현재는 판정을 보류",
            "브랜드 로고는 공식 이미지가 원본에 없으므로 생성한 텍스트 워드마크로 표시",
        ],
    }
