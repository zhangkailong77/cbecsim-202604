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
    from app.models import School, User
    from app.core.security import hash_password

    create_database_if_not_exists()
    Base.metadata.create_all(bind=engine)
    _ensure_users_columns()

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
