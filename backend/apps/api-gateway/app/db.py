import os
from urllib.parse import urlparse

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import Session, declarative_base, sessionmaker


DB_NAME = os.getenv("DB_NAME", "cbec_sim")
RAW_DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "mysql+pymysql://root:teaching2024@112.124.32.196:13306",
)


def _build_database_url(raw_url: str) -> str:
    if raw_url.startswith("sqlite"):
        return raw_url

    parsed = urlparse(raw_url)
    if parsed.path in ("", "/"):
        return f"{raw_url.rstrip('/')}/{DB_NAME}"
    return raw_url


DATABASE_URL = _build_database_url(RAW_DATABASE_URL)

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_database_if_not_exists():
    if DATABASE_URL.startswith("sqlite"):
        return

    admin_url = RAW_DATABASE_URL.rstrip("/")
    admin_engine = create_engine(admin_url, pool_pre_ping=True)
    with admin_engine.begin() as conn:
        conn.execute(text(f"CREATE DATABASE IF NOT EXISTS {DB_NAME}"))
    admin_engine.dispose()


def init_database():
    from app.models import MarketProduct, School, User
    from app.core.security import hash_password

    create_database_if_not_exists()
    Base.metadata.create_all(bind=engine)
    _ensure_users_columns()
    _ensure_market_products_columns()
    _cleanup_game_runs_legacy_columns()

    seed_school_names = [
        "清华大学",
        "北京大学",
        "中国人民大学",
        "北京师范大学",
        "复旦大学",
        "上海交通大学",
        "同济大学",
        "浙江大学",
        "南京大学",
        "武汉大学",
        "中山大学",
        "华中科技大学",
        "西安交通大学",
        "四川大学",
        "厦门大学",
        "山东大学",
        "吉林大学",
        "南开大学",
        "天津大学",
        "电子科技大学",
    ]

    admin_username = os.getenv("SUPER_ADMIN_USERNAME", "yzcube")
    admin_password = os.getenv("SUPER_ADMIN_INIT_PASSWORD", "Yanzhi2026.")

    with Session(engine) as db:
        existing_school_names = {s.name for s in db.query(School).all()}
        for school_name in seed_school_names:
            if school_name not in existing_school_names:
                db.add(School(name=school_name))

        existing = db.query(User).filter(User.username == admin_username).first()
        if not existing:
            db.add(
                User(
                    username=admin_username,
                    password_hash=hash_password(admin_password),
                    role="super_admin",
                    is_active=True,
                )
            )

        target_boards = {
            "sales": {
                "name_map": {
                    "美妆个护": "销量榜·美妆个护热销款",
                    "手机与数码": "销量榜·数码配件爆款",
                    "服饰配件": "销量榜·服饰配件趋势款",
                }
            },
            "new": {
                "name_map": {
                    "美妆个护": "新品榜·美妆个护上新款",
                    "手机与数码": "新品榜·数码配件上新款",
                    "服饰配件": "新品榜·服饰配件上新款",
                }
            },
            "hot": {
                "name_map": {
                    "美妆个护": "热推榜·美妆个护爆红款",
                    "手机与数码": "热推榜·数码配件爆红款",
                    "服饰配件": "热推榜·服饰配件爆红款",
                }
            },
        }
        target_per_category = 30

        existing_products = {
            (p.market, p.board_type, p.category, p.product_name)
            for p in db.query(
                MarketProduct.market,
                MarketProduct.board_type,
                MarketProduct.category,
                MarketProduct.product_name,
            ).all()
        }
        for board_type, board_config in target_boards.items():
            for category, name_prefix in board_config["name_map"].items():
                existing_count = (
                    db.query(MarketProduct)
                    .filter(
                        MarketProduct.market == "MY",
                        MarketProduct.board_type == board_type,
                        MarketProduct.category == category,
                    )
                    .count()
                )
                start = existing_count + 1
                for i in range(start, target_per_category + 1):
                    product_name = f"{name_prefix} {i:02d}"
                    key = ("MY", board_type, category, product_name)
                    if key in existing_products:
                        continue

                    supplier_price = 8 + ((i * 3) % 35)
                    price_spread = 10 + (i % 15)
                    suggested_price = supplier_price + price_spread

                    if board_type == "sales":
                        monthly_sales = 7000 + i * 520 + (i % 7) * 130
                        growth_rate = round(5.2 + (i % 8) * 0.7, 2)
                        new_score = round(40 + (i % 18) * 1.8, 2)
                        hot_score = round(55 + (i % 14) * 1.6, 2)
                    elif board_type == "new":
                        monthly_sales = 2800 + i * 190 + (i % 5) * 110
                        growth_rate = round(18 + (i % 10) * 1.9, 2)
                        new_score = round(78 + (i % 12) * 1.5, 2)
                        hot_score = round(46 + (i % 9) * 1.7, 2)
                    else:  # hot
                        monthly_sales = 4200 + i * 320 + (i % 6) * 140
                        growth_rate = round(10 + (i % 9) * 1.6, 2)
                        new_score = round(48 + (i % 11) * 1.3, 2)
                        hot_score = round(82 + (i % 10) * 1.4, 2)

                    monthly_revenue = monthly_sales * suggested_price
                    competition_level = "high" if i % 3 == 0 else ("medium" if i % 3 == 1 else "low")

                    db.add(
                        MarketProduct(
                            market="MY",
                            board_type=board_type,
                            category=category,
                            product_name=product_name,
                            supplier_price=supplier_price,
                            suggested_price=suggested_price,
                            monthly_sales=monthly_sales,
                            monthly_revenue=monthly_revenue,
                            new_score=new_score,
                            hot_score=hot_score,
                            growth_rate=growth_rate,
                            competition_level=competition_level,
                        )
                    )
        db.commit()


def _ensure_users_columns():
    inspector = inspect(engine)
    if "users" not in inspector.get_table_names():
        return

    existing_columns = {col["name"] for col in inspector.get_columns("users")}
    missing_sql = []
    if "school_id" not in existing_columns:
        missing_sql.append("ALTER TABLE users ADD COLUMN school_id INTEGER NULL")
    if "major" not in existing_columns:
        missing_sql.append("ALTER TABLE users ADD COLUMN major VARCHAR(128) NULL")
    if "class_name" not in existing_columns:
        missing_sql.append("ALTER TABLE users ADD COLUMN class_name VARCHAR(128) NULL")
    if "full_name" not in existing_columns:
        missing_sql.append("ALTER TABLE users ADD COLUMN full_name VARCHAR(64) NULL")

    if not missing_sql:
        return

    with engine.begin() as conn:
        for sql in missing_sql:
            conn.execute(text(sql))


def _cleanup_game_runs_legacy_columns():
    inspector = inspect(engine)
    if "game_runs" not in inspector.get_table_names():
        return

    # sqlite does not support DROP COLUMN in older compatibility paths used by tests;
    # legacy columns are safely ignored there.
    if DATABASE_URL.startswith("sqlite"):
        return

    existing_columns = {col["name"] for col in inspector.get_columns("game_runs")}
    drop_sql = []
    if "procurement_budget" in existing_columns:
        drop_sql.append("ALTER TABLE game_runs DROP COLUMN procurement_budget")
    if "logistics_budget" in existing_columns:
        drop_sql.append("ALTER TABLE game_runs DROP COLUMN logistics_budget")
    if "warehousing_budget" in existing_columns:
        drop_sql.append("ALTER TABLE game_runs DROP COLUMN warehousing_budget")
    if "marketing_budget" in existing_columns:
        drop_sql.append("ALTER TABLE game_runs DROP COLUMN marketing_budget")

    if not drop_sql:
        return

    with engine.begin() as conn:
        for sql in drop_sql:
            conn.execute(text(sql))


def _ensure_market_products_columns():
    inspector = inspect(engine)
    if "market_products" not in inspector.get_table_names():
        return

    existing_columns = {col["name"] for col in inspector.get_columns("market_products")}
    missing_sql = []
    if "board_type" not in existing_columns:
        missing_sql.append("ALTER TABLE market_products ADD COLUMN board_type VARCHAR(16) NOT NULL DEFAULT 'sales'")
    if "new_score" not in existing_columns:
        missing_sql.append("ALTER TABLE market_products ADD COLUMN new_score FLOAT NOT NULL DEFAULT 0")
    if "hot_score" not in existing_columns:
        missing_sql.append("ALTER TABLE market_products ADD COLUMN hot_score FLOAT NOT NULL DEFAULT 0")

    if not missing_sql:
        return

    with engine.begin() as conn:
        for sql in missing_sql:
            conn.execute(text(sql))
