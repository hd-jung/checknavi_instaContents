import json

from app.services.hwahae import CATEGORY_SPECS, parse_hwahae_page


def test_hwahae_parser_maps_required_product_fields():
    ranking_products = {
        "data": {
            "meta": {"last_updated_at_description": "2026.07.16. 업데이트"},
            "details": [
                {
                    "brand": {"id": 1, "name": "테스트브랜드"},
                    "goods": {
                        "id": 99,
                        "price": 18000,
                        "discount_rate": 40,
                        "image_url": "https://example.com/product.jpg",
                        "capacity": "50ml",
                    },
                    "product": {
                        "id": 77,
                        "name": "테스트 세럼",
                        "review_count": 1234,
                        "review_rating": 4.67,
                        "product_topics": [
                            {
                                "review_topic": {"sentence": "산뜻해요"},
                                "is_positive": True,
                                "review_count": 321,
                            }
                        ],
                    },
                    "rank_delta": 2,
                    "is_rank_new": False,
                }
            ],
        }
    }
    payload = {"props": {"pageProps": {"rankingProducts": ranking_products}}}
    html = f'<script id="__NEXT_DATA__" type="application/json">{json.dumps(payload)}</script>'

    product, updated = parse_hwahae_page(html, CATEGORY_SPECS[0])

    assert updated == "2026.07.16. 업데이트"
    assert product.rank == 1
    assert product.brand == "테스트브랜드"
    assert product.name == "테스트 세럼"
    assert product.sale_price_krw == 18000
    assert product.list_price_krw == 30000
    assert product.discount_rate == 40
    assert product.rating == 4.67
    assert product.reviews == 1234
    assert product.performance_topics == ["산뜻해요"]
    assert product.purchase_url == "https://www.hwahae.co.kr/goods/99"
