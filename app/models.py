from __future__ import annotations

from dataclasses import asdict, dataclass


@dataclass(slots=True)
class RankedProduct:
    rank: int
    source_rank: int
    brand: str
    name: str
    category: str
    category_ja: str
    rating: float
    reviews: int
    price: str
    image_url: str
    product_url: str
    trend: str = "same"
    award: str | None = None

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass(slots=True)
class RankingSnapshot:
    products: list[RankedProduct]
    updated_date: str
    aggregation_period: str
    collected_at: str
    source_url: str
    cache_hit: bool = False


@dataclass(slots=True)
class ExchangeRate:
    rate_per_100_krw: float | None
    as_of_date: str | None
    collected_at: str
    source_url: str
    cache_hit: bool = False
    error: str | None = None
