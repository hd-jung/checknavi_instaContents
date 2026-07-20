from fastapi.testclient import TestClient

from app.main import app
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


def test_trend_gap_is_a_separate_analysis_page_with_card_news_coming_soon():
    response = client.get("/trend-gap")

    assert response.status_code == 200
    assert 'href="/static/trend-gap.css"' in response.text
    assert 'src="/static/trend-gap.js"' in response.text
    assert "일본의 현재와" in response.text
    assert "TOP 5" in response.text
    assert "COMING" in response.text
    assert client.get("/static/trend-gap.js").status_code == 200


def test_trend_gap_api_returns_five_comparisons_and_honest_source_state():
    response = client.get("/api/trend-gap")

    assert response.status_code == 200
    data = response.json()
    assert len(data["comparisons"]) == 5
    assert len(data["top5"]) == 5
    assert data["sources"]["korea"]["mode"] == "reference_snapshot"
    assert data["top5"][0]["price_analysis"]["default_threshold"] == 20
    assert all("reviews_status" in row["korea"] for row in data["comparisons"])


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
    assert trend_gap.status_code == 200
    assert 'href="/trend-gap.css"' in trend_gap.text
    assert 'src="/trend-gap.js"' in trend_gap.text


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
