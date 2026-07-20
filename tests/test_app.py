from fastapi.testclient import TestClient

from app.main import app, weekly_service
from app.services.weekly import WeeklyRankingService


client = TestClient(app)


def test_local_dashboard_uses_mounted_static_assets():
    response = client.get("/")

    assert response.status_code == 200
    assert 'href="/static/styles.css"' in response.text
    assert 'src="/static/app.js"' in response.text
    assert "K-BEAUTY PULSE" in response.text
    assert 'href="/workspace"' in response.text
    assert client.get("/static/app.js").status_code == 200


def test_intelligence_workspace_keeps_the_new_tools():
    response = client.get("/workspace")

    assert response.status_code == 200
    assert 'href="/static/workspace-styles.css"' in response.text
    assert 'src="/static/workspace-app.js"' in response.text
    assert "Checknavi Beauty Intelligence" in response.text
    assert 'data-view="rank"' in response.text
    assert 'data-view="studio"' in response.text


def test_release_studio_keeps_existing_pages_and_adds_six_card_workflow():
    response = client.get("/releases")

    assert response.status_code == 200
    assert "신상 발매 카드뉴스" in response.text
    assert "PNG 6장 저장" in response.text
    assert 'href="/"' in response.text
    assert 'href="/workspace"' in response.text
    assert client.get("/static/releases.js").status_code == 200


def test_trend_gap_only_contains_market_comparison():
    response = client.get("/trend-gap")

    assert response.status_code == 200
    assert 'href="/static/trend-gap.css"' in response.text
    assert 'src="/static/trend-gap.js"' in response.text
    assert "한·일 랭킹" in response.text
    assert 'href="/opportunities"' in response.text
    assert "COMING<br" not in response.text
    assert client.get("/static/trend-gap.js").status_code == 200


def test_opportunity_product_and_coming_soon_are_separate_pages():
    opportunities = client.get("/opportunities")
    product = client.get("/products/skincare")
    content = client.get("/content-studio")

    assert opportunities.status_code == 200
    assert "광고 제안 후보" in opportunities.text
    assert 'src="/static/opportunities.js"' in opportunities.text
    assert client.get("/static/opportunities.js").status_code == 200
    assert product.status_code == 200
    assert 'data-product-id="skincare"' in product.text
    assert 'src="/static/product-detail.js"' in product.text
    assert client.get("/static/product-detail.js").status_code == 200
    assert client.get("/products/not-a-product").status_code == 404
    assert content.status_code == 200
    assert "COMING" in content.text
    assert "아직 연결하지 않았습니다" in content.text


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
        raise AssertionError("default trend-gap load should not crawl @cosme")

    monkeypatch.setattr(weekly_service, "get_snapshot", fail_if_called)
    response = client.get("/api/trend-gap")

    assert response.status_code == 200
    assert response.json()["sources"]["japan"]["mode"] == "fallback"


def test_vercel_dashboard_uses_public_root(monkeypatch):
    monkeypatch.setenv("VERCEL", "1")

    response = client.get("/")
    workspace = client.get("/workspace")

    assert response.status_code == 200
    assert 'href="/styles.css"' in response.text
    assert 'src="/app.js"' in response.text
    assert workspace.status_code == 200
    assert 'href="/workspace-styles.css"' in workspace.text
    assert 'src="/workspace-app.js"' in workspace.text
    releases = client.get("/releases")
    assert releases.status_code == 200
    assert 'href="/releases.css"' in releases.text
    assert 'src="/releases.js"' in releases.text
    trend_gap = client.get("/trend-gap")
    opportunities = client.get("/opportunities")
    product = client.get("/products/color")
    content = client.get("/content-studio")
    assert trend_gap.status_code == 200
    assert 'href="/trend-gap.css"' in trend_gap.text
    assert 'src="/trend-gap.js"' in trend_gap.text
    assert opportunities.status_code == 200
    assert 'src="/opportunities.js"' in opportunities.text
    assert product.status_code == 200
    assert 'src="/product-detail.js"' in product.text
    assert content.status_code == 200


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
