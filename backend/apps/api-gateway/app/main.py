import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from dotenv import load_dotenv
from pathlib import Path
import os
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.routes.auth import router as auth_router
from app.api.routes.game import router as game_router
from app.api.routes.health import router as health_router
from app.api.routes.market import router as market_router
from app.api.routes.shopee import router as shopee_router
from app.db import init_database
from app.services.auto_order_tick_worker import AUTO_ORDER_TICK_ENABLED, run_auto_order_tick_worker

load_dotenv(Path(__file__).resolve().parents[3] / ".env")

@asynccontextmanager
async def lifespan(_: FastAPI):
    stop_event: asyncio.Event | None = None
    worker_task: asyncio.Task | None = None
    if AUTO_ORDER_TICK_ENABLED:
        stop_event = asyncio.Event()
        worker_task = asyncio.create_task(run_auto_order_tick_worker(stop_event))
    try:
        yield
    finally:
        if stop_event and worker_task:
            stop_event.set()
            await worker_task


app = FastAPI(title="CBEC API Gateway", version="0.1.0", lifespan=lifespan)

DEFAULT_CORS_ALLOW_ORIGINS = "http://127.0.0.1:3001,http://localhost:3001"
DEFAULT_CORS_ALLOW_ORIGIN_REGEX = (
    r"^https?://(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3})(:\d{1,5})?$"
)


def get_cors_settings() -> dict:
    cors_origins = [
        origin.strip()
        for origin in os.getenv(
            "CORS_ALLOW_ORIGINS",
            DEFAULT_CORS_ALLOW_ORIGINS,
        ).split(",")
        if origin.strip()
    ]
    cors_origin_regex = os.getenv("CORS_ALLOW_ORIGIN_REGEX", DEFAULT_CORS_ALLOW_ORIGIN_REGEX).strip() or None
    return {
        "allow_origins": cors_origins,
        "allow_origin_regex": cors_origin_regex,
    }

app.add_middleware(
    CORSMiddleware,
    **get_cors_settings(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(auth_router)
app.include_router(game_router)
app.include_router(market_router)
app.include_router(shopee_router)

uploads_root = Path(__file__).resolve().parent / "uploads"
uploads_root.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=uploads_root), name="uploads")

init_database()
