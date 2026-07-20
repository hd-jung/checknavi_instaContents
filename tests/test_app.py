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
