from __future__ import annotations

import asyncio
import os
from contextlib import asynccontextmanager
from datetime import datetime
from html import escape
from pathlib import Path
from urllib.parse import urlparse
from zoneinfo import ZoneInfo

import httpx
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from app.models import ExchangeRate
from app.services.exchange import (
    FALLBACK_RATE_DATE,
    FALLBACK_RATE_PER_100_KRW,
    SOURCE_URL as EXCHANGE_SOURCE_URL,
    ExchangeRateService,
)
from app.services.intelligence import build_market_intelligence
from app.services.hwahae import (
    CATEGORY_SPECS,
    HwahaeRankingService,
    fallback_hwahae_snapshot,
)
from app.services.releases import ReleaseService
from app.services.weekly import (
    WeeklyRankingService,
    WeeklySnapshot,
    fallback_weekly_snapshot,
)


BASE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BASE_DIR.parent
PUBLIC_DIR = PROJECT_DIR / "public"
SEOUL = ZoneInfo("Asia/Seoul")
weekly_service = WeeklyRankingService()
hwahae_service = HwahaeRankingService()
exchange_service = ExchangeRateService()
release_service = ReleaseService()


@asynccontextmanager
async def lifespan(_: FastAPI):
    yield


app = FastAPI(
    title="Checknavi Beauty Intelligence",
    description="한·일 K-뷰티 신호 분석과 콘텐츠 제작 워크스페이스",
    version="2.0.0",
    lifespan=lifespan,
)
# Vercel serves ``public/`` from its CDN and intentionally omits that directory
# from the Python function bundle. Mount it only for local development.
if not os.getenv("VERCEL"):
    app.mount("/static", StaticFiles(directory=PUBLIC_DIR), name="static")
templates = Jinja2Templates(directory=BASE_DIR / "templates")
VALID_PRODUCT_IDS = {item["key"] for item in CATEGORY_SPECS}
TREND_REFRESH_TIMEOUT_SECONDS = 25.0


def build_dashboard(snapshot: WeeklySnapshot, exchange: ExchangeRate) -> dict:
    picks = snapshot.picks
    avg_rating = sum(product.rating for product in picks) / len(picks)
    total_reviews = sum(product.reviews for product in picks)
    source_mode = "fallback" if snapshot.fallback else ("cached" if snapshot.cache_hit else "live")

    return {
        "status": "ok",
        "server_time": datetime.now(SEOUL).isoformat(timespec="seconds"),
        "market": {
            "state": "최근 정상 데이터" if snapshot.fallback else "수집 정상",
            "source_mode": source_mode,
            "analyzed_count": 50,
            "visible_count": len(picks),
            "average_rating": round(avg_rating, 2),
            "total_reviews": total_reviews,
            "leading_category": picks[0].group_label,
            "leading_category_count": len(picks),
        },
        "weekly": {
            "categories": [product.to_dict() for product in picks],
            "updated_date": snapshot.updated_date,
            "aggregation_period": snapshot.aggregation_period,
            "collected_at": snapshot.collected_at,
            "source_url": snapshot.source_url,
            "scope_note": (
                "@cosme 직접 수집이 지연되어 2026/7/17 마지막 정상 스냅샷을 표시 중"
                if snapshot.fallback
                else "@cosme 한국 코스메 주간 TOP 50에서 5개 카테고리별 최상위 상품을 자동 선정"
            ),
            "muse_url": (
                "/images/weekly-muse.png"
                if os.getenv("VERCEL")
                else "/static/images/weekly-muse.png"
            ),
            "export_size": "1080 × 1350",
        },
        "exchange": {
            "rate_per_100_krw": exchange.rate_per_100_krw,
            "as_of_date": exchange.as_of_date,
            "collected_at": exchange.collected_at,
            "source_url": exchange.source_url,
            "source_name": "Frankfurter / 중앙은행 기준환율",
            "cache_hit": exchange.cache_hit,
            "error": exchange.error,
        },
    }


@app.get("/", response_class=HTMLResponse)
async def dashboard_page(request: Request):
    return templates.TemplateResponse(
        request=request,
        name="overview.html",
        context={
            "page_title": "시장 현황 · Checknavi",
            "active_page": "overview",
            "asset_prefix": "" if os.getenv("VERCEL") else "/static",
        },
    )


@app.get("/workspace", include_in_schema=False)
async def legacy_workspace():
    return RedirectResponse(url="/", status_code=308)


@app.get("/releases", include_in_schema=False)
async def legacy_releases():
    return RedirectResponse(url="/content", status_code=308)


@app.get("/rankings", response_class=HTMLResponse)
async def rankings_page(request: Request):
    return templates.TemplateResponse(
        request=request,
        name="rankings.html",
        context={
            "page_title": "한·일 랭킹 비교 · Checknavi",
            "active_page": "rankings",
            "asset_prefix": "" if os.getenv("VERCEL") else "/static",
        },
    )


@app.get("/trend-gap", include_in_schema=False)
async def legacy_trend_gap():
    return RedirectResponse(url="/rankings", status_code=308)


@app.get("/opportunities", response_class=HTMLResponse)
async def opportunity_page(request: Request):
    return templates.TemplateResponse(
        request=request,
        name="opportunities.html",
        context={
            "page_title": "광고 후보 TOP 5 · Checknavi",
            "active_page": "opportunities",
            "asset_prefix": "" if os.getenv("VERCEL") else "/static",
        },
    )


@app.get("/products/{product_id}", response_class=HTMLResponse)
async def product_detail_page(request: Request, product_id: str):
    if product_id not in VALID_PRODUCT_IDS:
        raise HTTPException(status_code=404, detail="분석 제품을 찾지 못했습니다.")
    return templates.TemplateResponse(
        request=request,
        name="product-detail.html",
        context={
            "page_title": "제품 상세 분석 · Checknavi",
            "product_id": product_id,
            "active_page": "opportunities",
            "asset_prefix": "" if os.getenv("VERCEL") else "/static",
        },
    )


@app.get("/content", response_class=HTMLResponse)
async def content_page(request: Request):
    return templates.TemplateResponse(
        request=request,
        name="content.html",
        context={
            "page_title": "카드뉴스 제작 · Coming Soon",
            "active_page": "content",
            "asset_prefix": "" if os.getenv("VERCEL") else "/static",
        },
    )


@app.get("/content-studio", include_in_schema=False)
async def legacy_content_studio():
    return RedirectResponse(url="/content", status_code=308)


@app.get("/api/trend-gap")
async def trend_gap_data(refresh: bool = Query(False)):
    # A Vercel cold start must not block the whole page on upstream crawling.
    # The regular page load uses a verified snapshot and a short FX lookup;
    # explicit refresh is the only path that attempts a live @cosme crawl.
    snapshot = fallback_weekly_snapshot()
    korea_snapshot = fallback_hwahae_snapshot()
    exchange = ExchangeRate(
        rate_per_100_krw=FALLBACK_RATE_PER_100_KRW,
        as_of_date=FALLBACK_RATE_DATE,
        collected_at=datetime.now(SEOUL).isoformat(timespec="seconds"),
        source_url=EXCHANGE_SOURCE_URL,
        cache_hit=True,
        error="기준 환율 스냅샷",
    )
    try:
        if refresh:
            snapshot, korea_snapshot, exchange = await asyncio.wait_for(
                asyncio.gather(
                    weekly_service.get_snapshot(force=True),
                    hwahae_service.get_snapshot(force=True),
                    exchange_service.get_rate(force=True),
                ),
                timeout=TREND_REFRESH_TIMEOUT_SECONDS,
            )
        else:
            exchange = await asyncio.wait_for(
                exchange_service.get_rate(),
                timeout=3.0,
            )
    except Exception as exc:
        exchange.error = (
            f"외부 데이터 연결 지연으로 검증 스냅샷을 사용합니다: {type(exc).__name__}"
        )
    return JSONResponse(
        content=build_market_intelligence(snapshot, korea_snapshot, exchange),
        headers={
            "Cache-Control": "no-store" if refresh else "public, max-age=60",
            "Vercel-CDN-Cache-Control": (
                "no-store"
                if refresh
                else "public, s-maxage=900, stale-while-revalidate=60"
            ),
        },
    )


@app.get("/api/brand-wordmark")
async def brand_wordmark(name: str = Query(..., min_length=1, max_length=40)):
    """Render a neutral wordmark when ranking sources do not expose logo artwork."""
    safe_name = escape(name.strip())
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" width="320" height="96" viewBox="0 0 320 96">
<rect width="320" height="96" rx="4" fill="#fffef9"/>
<rect x="1" y="1" width="318" height="94" rx="3" fill="none" stroke="#181916" stroke-width="2"/>
<text x="160" y="56" text-anchor="middle" fill="#181916" font-family="Arial, sans-serif" font-size="24" font-weight="700">{safe_name}</text>
</svg>"""
    return Response(
        content=svg,
        media_type="image/svg+xml",
        headers={"Cache-Control": "public, max-age=86400"},
    )


@app.get("/api/new-releases")
async def new_release_data(refresh: bool = Query(False)):
    snapshot, exchange = await asyncio.gather(
        release_service.get_snapshot(force=refresh),
        exchange_service.get_rate(force=refresh),
    )
    source_mode = "fallback" if snapshot.fallback else ("cached" if snapshot.cache_hit else "live")
    return JSONResponse(
        content={
            "status": "ok",
            "source_mode": source_mode,
            "collected_at": snapshot.collected_at,
            "source_url": snapshot.source_url,
            "exchange": {
                "rate_per_100_krw": exchange.rate_per_100_krw,
                "as_of_date": exchange.as_of_date,
            },
            "products": [
                product.to_dict(exchange.rate_per_100_krw)
                for product in snapshot.products[:5]
            ],
        },
        headers={
            "Cache-Control": "no-store" if refresh else "public, max-age=60",
            "Vercel-CDN-Cache-Control": "no-store" if refresh else "public, s-maxage=1800",
        },
    )


@app.get("/api/dashboard")
async def dashboard_data(refresh: bool = Query(False)):
    try:
        snapshot = await weekly_service.get_snapshot(force=refresh)
        exchange = await exchange_service.get_rate(force=refresh)
        cache_headers = (
            {
                "Cache-Control": "no-store",
                "Vercel-CDN-Cache-Control": "no-store",
            }
            if refresh
            else {
                "Cache-Control": "public, max-age=60",
                "Vercel-CDN-Cache-Control": (
                    "public, s-maxage=900, stale-while-revalidate=60"
                ),
            }
        )
        return JSONResponse(
            content=build_dashboard(snapshot, exchange),
            headers=cache_headers,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail={
                "message": "@cosme 랭킹을 불러오지 못했습니다.",
                "reason": f"{type(exc).__name__}: {exc}",
            },
        ) from exc


@app.get("/api/media")
async def proxy_cosme_media(url: str):
    """Proxy only @cosme product images so browser canvas exports stay same-origin."""
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower()
    if parsed.scheme != "https" or not (host == "cosme.net" or host.endswith(".cosme.net")):
        raise HTTPException(status_code=400, detail="허용되지 않은 이미지 URL입니다.")
    try:
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
            response = await client.get(url, headers={"User-Agent": "Mozilla/5.0"})
            response.raise_for_status()
        content_type = response.headers.get("content-type", "image/jpeg")
        if not content_type.startswith("image/"):
            raise HTTPException(status_code=415, detail="이미지 형식이 아닙니다.")
        return Response(
            content=response.content,
            media_type=content_type,
            headers={
                "Cache-Control": "public, max-age=86400",
                "Vercel-CDN-Cache-Control": (
                    "public, s-maxage=86400, stale-while-revalidate=604800"
                ),
            },
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail="상품 이미지를 가져오지 못했습니다.") from exc


@app.get("/health")
async def health():
    return {"status": "ok", "time": datetime.now(SEOUL).isoformat(timespec="seconds")}
