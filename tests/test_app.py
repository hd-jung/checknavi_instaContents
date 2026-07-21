from fastapi.testclient import TestClient

from app.main import TREND_REFRESH_TIMEOUT_SECONDS, app, weekly_service
from app.services.weekly import WeeklyRankingService


client = TestClient(app)


def test_overview_is_the_single_app_entrypoint():
    response = client.get("/")

    assert response.status_code == 200
    assert "무엇을 제안할까" in response.text
    assert 'href="/static/checknavi.css"' in response.text
    assert 'src="/static/data-ui.js"' in response.text
    assert 'src="/static/overview.js"' in response.text
    assert 'href="/rankings"' in response.text
    assert 'href="/opportunities"' in response.text
    assert 'href="/content"' in response.text


def test_rankings_page_has_one_focused_comparison_stage():
    response = client.get("/rankings")

    assert response.status_code == 200
    assert "한·일 랭킹 비교" in response.text
    assert 'id="comparison-stage"' not in response.text
    assert 'class="comparison-stage"' in response.text
    assert 'src="/static/rankings.js"' in response.text
    assert "광고 후보 TOP 5" in response.text


def test_opportunities_and_product_detail_are_connected():
    opportunities = client.get("/opportunities")
    product = client.get("/products/skincare")

    assert opportunities.status_code == 200
    assert "광고 후보 TOP 5" in opportunities.text
    assert 'src="/static/opportunities.js"' in opportunities.text
    assert product.status_code == 200
    assert 'data-product-id="skincare"' in product.text
    assert 'src="/static/product.js"' in product.text
    assert client.get("/products/not-a-product").status_code == 404


def test_content_page_is_coming_soon_only():
    response = client.get("/content")

    assert response.status_code == 200
    assert "COMING" in response.text
    assert "다음 단계에서 연결합니다" in response.text
    assert "PNG" not in response.text


def test_legacy_pages_redirect_into_the_new_app():
    assert client.get("/workspace", follow_redirects=False).headers["location"] == "/"
    assert client.get("/trend-gap", follow_redirects=False).headers["location"] == "/rankings"
    assert client.get("/releases", follow_redirects=False).headers["location"] == "/content"
    assert client.get("/content-studio", follow_redirects=False).headers["location"] == "/content"


def test_trend_gap_api_returns_five_comparisons_and_honest_source_state():
    response = client.get("/api/trend-gap")

    assert response.status_code == 200
    data = response.json()
    assert len(data["comparisons"]) == 5
    assert len(data["top5"]) == 5
    assert data["sources"]["korea"]["mode"] == "reference_snapshot"
    assert data["top5"][0]["price_analysis"]["default_threshold"] == 20
    assert all("reviews_status" in row["korea"] for row in data["comparisons"])


def test_trend_gap_default_load_does_not_wait_for_cosme(monkeypatch):
    async def fail_if_called(*args, **kwargs):
        raise AssertionError("default load should not crawl @cosme")

    monkeypatch.setattr(weekly_service, "get_snapshot", fail_if_called)
    response = client.get("/api/trend-gap")

    assert response.status_code == 200
    assert response.json()["sources"]["japan"]["mode"] == "fallback"


def test_live_refresh_allows_slow_cosme_collection():
    assert TREND_REFRESH_TIMEOUT_SECONDS == 25.0


def test_vercel_pages_use_public_root(monkeypatch):
    monkeypatch.setenv("VERCEL", "1")

    for path in ["/", "/rankings", "/opportunities", "/products/color", "/content"]:
        response = client.get(path)
        assert response.status_code == 200
        assert 'href="/checknavi.css"' in response.text
        assert 'src="/data-ui.js"' in response.text


def test_weekly_service_falls_back_when_cosme_is_unavailable(monkeypatch):
    service = WeeklyRankingService()

    async def fail_fetch():
        raise TimeoutError("@cosme unavailable")

    monkeypatch.setattr(service, "_fetch_snapshot", fail_fetch)

    import asyncio

    snapshot = asyncio.run(service.get_snapshot())
    assert snapshot.fallback is True
    assert snapshot.cache_hit is True
    assert snapshot.updated_date == "2026/7/17"
    assert len(snapshot.picks) == 5
