from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_local_dashboard_uses_mounted_static_assets():
    response = client.get("/")

    assert response.status_code == 200
    assert 'href="/static/styles.css"' in response.text
    assert 'src="/static/app.js"' in response.text
    assert "Checknavi Beauty Intelligence" in response.text
    assert 'data-view="rank"' in response.text
    assert 'data-view="studio"' in response.text
    assert client.get("/static/app.js").status_code == 200


def test_vercel_dashboard_uses_public_root(monkeypatch):
    monkeypatch.setenv("VERCEL", "1")

    response = client.get("/")

    assert response.status_code == 200
    assert 'href="/styles.css"' in response.text
    assert 'src="/app.js"' in response.text
