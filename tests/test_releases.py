import asyncio

from app.services.releases import (
    ReleaseService,
    fallback_release_snapshot,
    parse_calendar_candidates,
)


def test_calendar_parser_finds_korean_brand_products():
    html = """
    <section>
      <h3>7月28日 (火)</h3>
      <div>
        <h4>TIRTIR</h4>
        <a href="/products/10300246/">TIRTIRハイドラヴェール セラムパウダー</a>
      </div>
      <div>
        <h4>日本ブランド</h4>
        <a href="/products/10000000/">対象外</a>
      </div>
    </section>
    """

    rows = parse_calendar_candidates(html, 2026, 7)

    assert len(rows) == 1
    assert rows[0]["brand"] == "TIRTIR"
    assert rows[0]["release_date"] == "2026-07-28"
    assert rows[0]["product_url"].endswith("/products/10300246/")


def test_release_service_uses_fallback_on_upstream_failure(monkeypatch):
    service = ReleaseService()

    async def fail_fetch():
        raise TimeoutError("@cosme unavailable")

    monkeypatch.setattr(service, "_fetch_snapshot", fail_fetch)
    snapshot = asyncio.run(service.get_snapshot())

    assert snapshot.fallback is True
    assert snapshot.cache_hit is True
    assert len(snapshot.products) == 5
    assert snapshot.products[0].price_jpy == 2530


def test_release_payload_calculates_exchange_price():
    snapshot = fallback_release_snapshot()

    payload = snapshot.products[0].to_dict(rate_per_100_krw=9.1)

    assert payload["price_krw"] == round(2530 / 9.1 * 100)
