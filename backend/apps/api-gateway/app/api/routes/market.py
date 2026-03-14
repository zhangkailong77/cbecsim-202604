from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import asc, desc, func
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import MarketProduct


router = APIRouter(prefix="/market", tags=["market"])

SUPPORTED_MARKET = "MY"
ALLOWED_CATEGORIES = [
    "美妆个护",
    "手机与数码",
    "服饰配件",
]


class MarketCategoryResponse(BaseModel):
    category: str


class LeaderboardItemResponse(BaseModel):
    id: int
    market: str
    board_type: str
    category: str
    product_name: str
    supplier_price: int
    suggested_price: int
    monthly_sales: int
    monthly_revenue: int
    growth_rate: float
    competition_level: str
    cover_url: str | None = None


class LeaderboardPageResponse(BaseModel):
    items: list[LeaderboardItemResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


@router.get("/categories", response_model=list[MarketCategoryResponse])
def get_market_categories(
    market: str = Query(default="MY", min_length=2, max_length=16),
    db: Session = Depends(get_db),
) -> list[MarketCategoryResponse]:
    if market.strip().upper() != SUPPORTED_MARKET:
        return []

    rows = (
        db.query(MarketProduct.category)
        .filter(MarketProduct.market == market.strip().upper())
        .distinct()
        .order_by(MarketProduct.category.asc())
        .all()
    )
    existing = {row[0] for row in rows}
    categories = [c for c in ALLOWED_CATEGORIES if c in existing]
    return [MarketCategoryResponse(category=item) for item in categories]


@router.get("/leaderboard", response_model=LeaderboardPageResponse)
def get_market_leaderboard(
    market: str = Query(default="MY", min_length=2, max_length=16),
    board_type: str = Query(default="sales"),
    category: str | None = None,
    q: str = "",
    sort_by: str = Query(default="sales"),
    order: str = Query(default="desc"),
    page: int = Query(default=1, ge=1),
    db: Session = Depends(get_db),
) -> LeaderboardPageResponse:
    page_size = 20
    market_code = market.strip().upper()
    if market_code != SUPPORTED_MARKET:
        return LeaderboardPageResponse(items=[], total=0, page=page, page_size=page_size, total_pages=0)
    board_key = board_type.strip().lower()
    if board_key not in {"sales", "new", "hot"}:
        board_key = "sales"
    query = db.query(MarketProduct).filter(
        MarketProduct.market == market_code,
        MarketProduct.board_type == board_key,
    )
    if category:
        cat = category.strip()
        if cat not in ALLOWED_CATEGORIES:
            return LeaderboardPageResponse(items=[], total=0, page=page, page_size=page_size, total_pages=0)
        query = query.filter(MarketProduct.category == cat)
    else:
        query = query.filter(MarketProduct.category.in_(ALLOWED_CATEGORIES))
    keyword = q.strip()
    if keyword:
        query = query.filter(MarketProduct.product_name.like(f"%{keyword}%"))

    board_sort_defaults = {
        "sales": "sales",
        "new": "new_score",
        "hot": "hot_score",
    }
    sort_key = sort_by.strip().lower()
    if sort_key not in {"sales", "growth", "revenue", "margin", "new_score", "hot_score"}:
        sort_key = board_sort_defaults.get(board_key, "sales")

    sort_map = {
        "sales": MarketProduct.monthly_sales,
        "growth": MarketProduct.growth_rate,
        "revenue": MarketProduct.monthly_revenue,
        "margin": (MarketProduct.suggested_price - MarketProduct.supplier_price),
        "new_score": MarketProduct.new_score,
        "hot_score": MarketProduct.hot_score,
    }
    order_col = sort_map.get(sort_key, MarketProduct.monthly_sales)
    order_fn = desc if order.strip().lower() == "desc" else asc
    total = query.with_entities(func.count(MarketProduct.id)).scalar() or 0
    total_pages = (total + page_size - 1) // page_size if total > 0 else 0
    offset = (page - 1) * page_size
    rows = query.order_by(order_fn(order_col), MarketProduct.id.asc()).offset(offset).limit(page_size).all()

    return LeaderboardPageResponse(
        items=[
            LeaderboardItemResponse(
                id=item.id,
                market=item.market,
                board_type=item.board_type,
                category=item.category,
                product_name=item.product_name,
                supplier_price=item.supplier_price,
                suggested_price=item.suggested_price,
                monthly_sales=item.monthly_sales,
                monthly_revenue=item.monthly_revenue,
                growth_rate=item.growth_rate,
                competition_level=item.competition_level,
                cover_url=item.cover_url,
            )
            for item in rows
        ],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )
