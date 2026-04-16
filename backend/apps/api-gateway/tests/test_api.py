import os
from datetime import datetime, timedelta
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from fastapi.testclient import TestClient

DB_FILE = Path(__file__).with_name("test_auth.db")
if DB_FILE.exists():
    DB_FILE.unlink()

os.environ["DATABASE_URL"] = f"sqlite:///{DB_FILE}"
os.environ["SUPER_ADMIN_INIT_PASSWORD"] = "yzcube123"

from app.main import app


client = TestClient(app)


def _register_or_login_player(phone: str, password: str = "player123") -> str:
    school_resp = client.get("/auth/schools", params={"q": "北京"})
    assert school_resp.status_code == 200
    school_id = school_resp.json()[0]["id"]

    register_resp = client.post(
        "/auth/register",
        json={
            "school_id": school_id,
            "major": "电子商务",
            "class_name": "电商2301",
            "full_name": f"玩家{phone[-2:]}",
            "username": phone,
            "password": password,
        },
    )
    assert register_resp.status_code in (201, 409)

    login_resp = client.post(
        "/auth/login",
        json={"username": phone, "password": password},
    )
    assert login_resp.status_code == 200
    return login_resp.json()["access_token"]


def _create_running_run(token: str, initial_cash: int = 200000, duration_days: int = 365) -> dict:
    response = client.post(
        "/game/runs",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "initial_cash": initial_cash,
            "market": "MY",
            "duration_days": duration_days,
        },
    )
    assert response.status_code == 201
    return response.json()


def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_register_player_success():
    school_resp = client.get("/auth/schools", params={"q": "北京"})
    assert school_resp.status_code == 200
    assert len(school_resp.json()) > 0
    school_id = school_resp.json()[0]["id"]

    response = client.post(
        "/auth/register",
        json={
            "school_id": school_id,
            "major": "电子商务",
            "class_name": "电商2301",
            "full_name": "张三",
            "username": "13800138000",
            "password": "player123",
        },
    )
    assert response.status_code == 201
    body = response.json()
    assert body["username"] == "13800138000"
    assert body["role"] == "player"


def test_register_player_requires_phone_username():
    school_resp = client.get("/auth/schools", params={"q": "北京"})
    school_id = school_resp.json()[0]["id"]

    response = client.post(
        "/auth/register",
        json={
            "school_id": school_id,
            "major": "电子商务",
            "class_name": "电商2301",
            "full_name": "李四",
            "username": "player_test",
            "password": "player123",
        },
    )
    assert response.status_code == 400


def test_register_player_requires_valid_school():
    response = client.post(
        "/auth/register",
        json={
            "school_id": 999999,
            "major": "电子商务",
            "class_name": "电商2301",
            "full_name": "王五",
            "username": "13900139000",
            "password": "player123",
        },
    )
    assert response.status_code == 400


def test_login_success_player():
    response = client.post(
        "/auth/login",
        json={"username": "13800138000", "password": "player123"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["access_token"]


def test_login_success_super_admin():
    response = client.post(
        "/auth/login",
        json={"username": "yzcube", "password": "yzcube123"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["access_token"]


def test_login_invalid_credentials():
    response = client.post(
        "/auth/login",
        json={"username": "13800138000", "password": "wrong-password"},
    )
    assert response.status_code == 401


def test_me_requires_auth():
    response = client.get("/auth/me")
    assert response.status_code == 401


def test_me_returns_current_user():
    login = client.post(
        "/auth/login",
        json={"username": "yzcube", "password": "yzcube123"},
    )
    token = login.json()["access_token"]
    response = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    body = response.json()
    assert body["username"] == "yzcube"
    assert body["role"] == "super_admin"


def test_school_search():
    response = client.get("/auth/schools", params={"q": "清华"})
    assert response.status_code == 200
    body = response.json()
    assert len(body) > 0
    assert any("清华" in item["name"] for item in body)


def test_cors_preflight_allows_lan_origin_for_login():
    response = client.options(
        "/auth/login",
        headers={
            "Origin": "http://192.168.200.106:3001",
            "Access-Control-Request-Method": "POST",
        },
    )
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == "http://192.168.200.106:3001"


def test_cors_settings_allow_lan_origin_by_default(monkeypatch):
    monkeypatch.setenv("CORS_ALLOW_ORIGINS", "http://127.0.0.1:3001,http://localhost:3001")
    monkeypatch.delenv("CORS_ALLOW_ORIGIN_REGEX", raising=False)

    from app.main import get_cors_settings

    cors_settings = get_cors_settings()

    test_app = FastAPI()
    test_app.add_middleware(
        CORSMiddleware,
        **cors_settings,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    test_client = TestClient(test_app)

    origin = "http://192.168.200.106:3001"
    response = test_client.options(
        "/any",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "POST",
        },
    )
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == origin


def test_game_current_run_is_none_when_not_started():
    token = _register_or_login_player("13800138011")
    response = client.get("/game/runs/current", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    assert response.json() == {"run": None}


def test_game_create_run_success():
    token = _register_or_login_player("13800138012")
    response = client.post(
        "/game/runs",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "initial_cash": 200000,
            "market": "MY",
            "duration_days": 365,
        },
    )
    assert response.status_code == 201
    body = response.json()
    assert body["initial_cash"] == 200000
    assert body["market"] == "MY"
    assert body["status"] == "running"


def test_game_create_run_blocks_duplicate_running_run():
    token = _register_or_login_player("13800138013")
    first = client.post(
        "/game/runs",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "initial_cash": 200000,
            "market": "MY",
            "duration_days": 365,
        },
    )
    assert first.status_code == 201

    second = client.post(
        "/game/runs",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "initial_cash": 200000,
            "market": "MY",
            "duration_days": 365,
        },
    )
    assert second.status_code == 409


def test_game_create_run_allows_total_cash_only():
    token = _register_or_login_player("13800138014")
    response = client.post(
        "/game/runs",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "initial_cash": 200000,
            "market": "MY",
            "duration_days": 365,
        },
    )
    assert response.status_code == 201


def test_game_create_run_accepts_7_days_duration():
    token = _register_or_login_player("13800138141")
    response = client.post(
        "/game/runs",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "initial_cash": 200000,
            "market": "MY",
            "duration_days": 7,
        },
    )
    assert response.status_code == 201
    assert response.json()["duration_days"] == 7


def test_game_create_run_auto_finishes_expired_running_run():
    from app.db import SessionLocal
    from app.models import GameRun

    token = _register_or_login_player("13800138142")
    first = client.post(
        "/game/runs",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "initial_cash": 200000,
            "market": "MY",
            "duration_days": 7,
        },
    )
    assert first.status_code == 201
    first_run_id = int(first.json()["id"])

    with SessionLocal() as db:
        run = db.query(GameRun).filter(GameRun.id == first_run_id).first()
        assert run is not None
        run.created_at = datetime.utcnow() - timedelta(hours=4)
        db.commit()

    second = client.post(
        "/game/runs",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "initial_cash": 300000,
            "market": "MY",
            "duration_days": 7,
        },
    )
    assert second.status_code == 201

    with SessionLocal() as db:
        first_run = db.query(GameRun).filter(GameRun.id == first_run_id).first()
        assert first_run is not None
        assert first_run.status == "finished"


def test_game_current_run_returns_none_after_expiry():
    from app.db import SessionLocal
    from app.models import GameRun

    token = _register_or_login_player("13800138143")
    created = client.post(
        "/game/runs",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "initial_cash": 200000,
            "market": "MY",
            "duration_days": 7,
        },
    )
    assert created.status_code == 201
    run_id = int(created.json()["id"])

    with SessionLocal() as db:
        row = db.query(GameRun).filter(GameRun.id == run_id).first()
        assert row is not None
        row.created_at = datetime.utcnow() - timedelta(days=8)
        db.commit()

    current = client.get("/game/runs/current", headers={"Authorization": f"Bearer {token}"})
    assert current.status_code == 200
    payload = current.json()
    assert payload["run"] is None

    with SessionLocal() as db:
        row = db.query(GameRun).filter(GameRun.id == run_id).first()
        assert row is not None
        assert row.status == "finished"


def test_game_current_run_prefers_running_when_finished_and_running_both_exist():
    from app.db import SessionLocal
    from app.models import GameRun

    token = _register_or_login_player("13800138229")
    first = _create_running_run(token, duration_days=7)

    with SessionLocal() as db:
        first_row = db.query(GameRun).filter(GameRun.id == first["id"]).first()
        assert first_row is not None
        first_row.created_at = datetime.utcnow() - timedelta(days=8)
        db.commit()

    second = _create_running_run(token, duration_days=365)

    current = client.get("/game/runs/current", headers={"Authorization": f"Bearer {token}"})
    assert current.status_code == 200
    payload = current.json()
    assert payload["run"] is not None
    assert payload["run"]["id"] == second["id"]
    assert payload["run"]["status"] == "running"


def test_game_read_endpoint_allows_finished_run():
    from app.db import SessionLocal
    from app.models import GameRun

    token = _register_or_login_player("13800138144")
    run = _create_running_run(token, duration_days=7)

    with SessionLocal() as db:
        row = db.query(GameRun).filter(GameRun.id == run["id"]).first()
        assert row is not None
        row.created_at = datetime.utcnow() - timedelta(days=8)
        db.commit()

    resp = client.get(
        f"/game/runs/{run['id']}/procurement/cart-summary",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200


def test_game_write_endpoint_rejects_finished_run():
    from app.db import SessionLocal
    from app.models import GameRun

    token = _register_or_login_player("13800138145")
    run = _create_running_run(token, duration_days=7)
    list_resp = client.get("/market/leaderboard", params={"market": "MY", "page": 1})
    product = list_resp.json()["items"][0]

    with SessionLocal() as db:
        row = db.query(GameRun).filter(GameRun.id == run["id"]).first()
        assert row is not None
        row.created_at = datetime.utcnow() - timedelta(days=8)
        db.commit()

    resp = client.post(
        f"/game/runs/{run['id']}/procurement/orders",
        headers={"Authorization": f"Bearer {token}"},
        json={"items": [{"product_id": product["id"], "quantity": 1000}]},
    )
    assert resp.status_code == 400
    assert "已结束" in str(resp.json().get("detail", ""))


def test_game_logistics_shipments_allows_finished_run():
    from app.db import SessionLocal
    from app.models import GameRun

    token = _register_or_login_player("13800138146")
    run = _create_running_run(token, duration_days=7)

    with SessionLocal() as db:
        row = db.query(GameRun).filter(GameRun.id == run["id"]).first()
        assert row is not None
        row.created_at = datetime.utcnow() - timedelta(days=8)
        db.commit()

    resp = client.get(
        f"/game/runs/{run['id']}/logistics/shipments",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    assert "shipments" in resp.json()


def test_game_create_logistics_shipment_rejects_finished_run():
    from app.db import SessionLocal
    from app.models import GameRun

    token = _register_or_login_player("13800138147")
    run = _create_running_run(token, duration_days=7)

    with SessionLocal() as db:
        row = db.query(GameRun).filter(GameRun.id == run["id"]).first()
        assert row is not None
        row.created_at = datetime.utcnow() - timedelta(days=8)
        db.commit()

    resp = client.post(
        f"/game/runs/{run['id']}/logistics/shipments",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "order_ids": [1],
            "forwarder_key": "economy",
            "customs_key": "normal",
        },
    )
    assert resp.status_code == 400
    assert "已结束" in str(resp.json().get("detail", ""))


def test_game_warehouse_summary_allows_finished_run():
    from app.db import SessionLocal
    from app.models import GameRun, LogisticsShipment, WarehouseInboundOrder, WarehouseStrategy

    token = _register_or_login_player("13800138148")
    run = _create_running_run(token, duration_days=7)

    with SessionLocal() as db:
        row = db.query(GameRun).filter(GameRun.id == run["id"]).first()
        assert row is not None
        row.status = "finished"
        row.created_at = datetime.utcnow() - timedelta(days=8)

        strategy = WarehouseStrategy(
            run_id=row.id,
            user_id=row.user_id,
            market=row.market,
            warehouse_mode="official",
            warehouse_location="near_kl",
            one_time_cost=1200,
            inbound_cost=800,
            rent_cost=500,
            total_cost=2500,
            delivery_eta_score=88,
            fulfillment_accuracy=0.96,
            warehouse_cost_per_order=9,
            status="archived",
        )
        db.add(strategy)
        db.flush()

        shipment = LogisticsShipment(
            run_id=row.id,
            user_id=row.user_id,
            forwarder_key="standard",
            forwarder_label="标准线（马来）",
            customs_key="normal",
            customs_label="标准清关",
            cargo_value=95000,
            logistics_fee=5000,
            customs_fee=1200,
            total_fee=6200,
            transport_days=12,
            customs_days=4,
        )
        db.add(shipment)
        db.flush()

        db.add(
            WarehouseInboundOrder(
                run_id=row.id,
                strategy_id=strategy.id,
                shipment_id=shipment.id,
                total_quantity=4000,
                total_value=95000,
                status="completed",
                completed_at=datetime.utcnow(),
            )
        )
        db.commit()

    resp = client.get(
        f"/game/runs/{run['id']}/warehouse/summary",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    payload = resp.json()
    assert payload["completed_inbound_count"] == 1
    assert payload["completed_inbound_total_quantity"] == 4000
    assert payload["completed_inbound_total_value"] == 95000
    assert payload["strategy"] is not None
    assert payload["strategy"]["warehouse_mode"] == "official"


def test_game_create_warehouse_strategy_rejects_finished_run():
    from app.db import SessionLocal
    from app.models import GameRun

    token = _register_or_login_player("13800138149")
    run = _create_running_run(token, duration_days=7)

    with SessionLocal() as db:
        row = db.query(GameRun).filter(GameRun.id == run["id"]).first()
        assert row is not None
        row.created_at = datetime.utcnow() - timedelta(days=8)
        db.commit()

    resp = client.post(
        f"/game/runs/{run['id']}/warehouse/strategy",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "warehouse_mode": "self_built",
            "warehouse_location": "near_kl",
        },
    )
    assert resp.status_code == 400
    assert "已结束" in str(resp.json().get("detail", ""))


def test_game_history_options_returns_finished_only():
    from app.db import SessionLocal
    from app.models import GameRun

    token = _register_or_login_player("13800138190")
    first_run = _create_running_run(token, duration_days=7)

    with SessionLocal() as db:
        row = db.query(GameRun).filter(GameRun.id == first_run["id"]).first()
        assert row is not None
        row.status = "finished"
        row.created_at = datetime.utcnow() - timedelta(days=8)
        db.commit()

    second_run = _create_running_run(token, duration_days=7)

    resp = client.get(
        "/game/runs/history/options",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    payload = resp.json()
    run_ids = [int(row["id"]) for row in payload.get("runs", [])]
    assert first_run["id"] in run_ids
    assert second_run["id"] not in run_ids


def test_game_run_context_allows_finished_run():
    from app.db import SessionLocal
    from app.models import GameRun

    token = _register_or_login_player("13800138191")
    run = _create_running_run(token, duration_days=7)

    with SessionLocal() as db:
        row = db.query(GameRun).filter(GameRun.id == run["id"]).first()
        assert row is not None
        row.status = "finished"
        row.created_at = datetime.utcnow() - timedelta(days=8)
        db.commit()

    resp = client.get(
        f"/game/runs/{run['id']}/context",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    payload = resp.json()
    assert payload["id"] == run["id"]
    assert payload["status"] == "finished"


def test_game_history_summary_requires_finished_and_returns_aggregate_fields():
    from app.db import SessionLocal
    from app.models import GameRun

    token = _register_or_login_player("13800138192")
    run = _create_running_run(token, duration_days=7)

    running_resp = client.get(
        f"/game/runs/{run['id']}/history/summary",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert running_resp.status_code == 400

    with SessionLocal() as db:
        row = db.query(GameRun).filter(GameRun.id == run["id"]).first()
        assert row is not None
        row.status = "finished"
        row.created_at = datetime.utcnow() - timedelta(days=8)
        db.commit()

    finished_resp = client.get(
        f"/game/runs/{run['id']}/history/summary",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert finished_resp.status_code == 200
    payload = finished_resp.json()
    assert payload["run"]["id"] == run["id"]
    assert payload["run"]["status"] == "finished"
    assert "procurement_order_count" in payload
    assert "logistics_shipment_count" in payload
    assert "warehouse_completed_inbound_count" in payload
    assert "shopee_order_total_count" in payload
    assert "shopee_order_sold_inventory_quantity" in payload


def test_game_history_summary_uses_cache_payload_for_owner(monkeypatch):
    from app.api.routes import game as game_route
    from app.db import SessionLocal
    from app.models import GameRun

    token = _register_or_login_player("13800138226")
    run = _create_running_run(token, duration_days=7)

    with SessionLocal() as db:
        row = db.query(GameRun).filter(GameRun.id == run["id"]).first()
        assert row is not None
        row.status = "finished"
        db.commit()

    cached_payload = {
        "run": {
            "id": run["id"],
            "user_id": run["user_id"],
            "initial_cash": run["initial_cash"],
            "market": run["market"],
            "duration_days": run["duration_days"],
            "day_index": run["day_index"],
            "status": "finished",
            "created_at": run["created_at"],
        },
        "initial_cash": float(run["initial_cash"]),
        "total_cash": float(run["initial_cash"]),
        "income_withdrawal_total": 0.0,
        "total_expense": 0.0,
        "current_balance": float(run["initial_cash"]),
        "procurement_order_count": 0,
        "logistics_shipment_count": 0,
        "warehouse_completed_inbound_count": 0,
        "inventory_total_quantity": 0,
        "inventory_total_sku": 0,
        "shopee_order_total_count": 0,
        "shopee_order_toship_count": 0,
        "shopee_order_shipping_count": 0,
        "shopee_order_completed_count": 0,
        "shopee_order_cancelled_count": 0,
        "shopee_order_sold_inventory_quantity": 0,
        "shopee_order_generation_log_count": 0,
    }
    monkeypatch.setattr(game_route, "cache_get_json", lambda _key: cached_payload, raising=False)

    resp = client.get(
        f"/game/runs/{run['id']}/history/summary",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    payload = resp.json()
    assert payload["run"]["id"] == run["id"]
    assert payload["total_cash"] == float(run["initial_cash"])


def test_game_history_summary_cache_does_not_bypass_run_ownership(monkeypatch):
    from app.api.routes import game as game_route
    from app.db import SessionLocal
    from app.models import GameRun

    owner_token = _register_or_login_player("13800138227")
    stranger_token = _register_or_login_player("13800138228")
    run = _create_running_run(owner_token, duration_days=7)

    with SessionLocal() as db:
        row = db.query(GameRun).filter(GameRun.id == run["id"]).first()
        assert row is not None
        row.status = "finished"
        db.commit()

    monkeypatch.setattr(
        game_route,
        "cache_get_json",
        lambda _key: {
            "run": {
                "id": run["id"],
                "user_id": run["user_id"],
                "initial_cash": run["initial_cash"],
                "market": run["market"],
                "duration_days": run["duration_days"],
                "day_index": run["day_index"],
                "status": "finished",
                "created_at": run["created_at"],
            }
        },
        raising=False,
    )

    resp = client.get(
        f"/game/runs/{run['id']}/history/summary",
        headers={"Authorization": f"Bearer {stranger_token}"},
    )
    assert resp.status_code == 404


def test_game_reset_current_run_success():
    token = _register_or_login_player("13800138015")
    create = client.post(
        "/game/runs",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "initial_cash": 200000,
            "market": "MY",
            "duration_days": 365,
        },
    )
    assert create.status_code == 201

    reset = client.post("/game/runs/reset-current", headers={"Authorization": f"Bearer {token}"})
    assert reset.status_code == 200
    assert reset.json()["status"] == "abandoned"

    current = client.get("/game/runs/current", headers={"Authorization": f"Bearer {token}"})
    assert current.status_code == 200
    assert current.json() == {"run": None}


def test_market_categories_returns_data():
    response = client.get("/market/categories", params={"market": "MY"})
    assert response.status_code == 200
    body = response.json()
    assert isinstance(body, list)
    assert len(body) > 0


def test_market_leaderboard_default_returns_rows():
    response = client.get("/market/leaderboard", params={"market": "MY"})
    assert response.status_code == 200
    body = response.json()
    assert body["page_size"] == 20
    assert body["page"] == 1
    assert body["total"] >= 0
    assert isinstance(body["items"], list)
    assert len(body["items"]) > 0
    assert "product_name" in body["items"][0]
    assert "monthly_sales" in body["items"][0]


def test_market_leaderboard_supports_category_and_sort():
    response = client.get(
        "/market/leaderboard",
        params={
            "market": "MY",
            "category": "美妆个护",
            "sort_by": "growth",
            "order": "desc",
            "limit": 10,
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert len(body["items"]) > 0
    assert all(item["category"] == "美妆个护" for item in body["items"])


def test_market_only_supports_my_now():
    response = client.get("/market/leaderboard", params={"market": "SG"})
    assert response.status_code == 200
    body = response.json()
    assert body["items"] == []
    assert body["total"] == 0


def test_market_categories_limited_to_allowed_list():
    allowed = {
        "美妆个护",
        "手机与数码",
        "服饰配件",
    }
    response = client.get("/market/categories", params={"market": "MY"})
    assert response.status_code == 200
    body = response.json()
    assert all(item["category"] in allowed for item in body)


def test_market_leaderboard_supports_pagination_and_keyword():
    page_1 = client.get("/market/leaderboard", params={"market": "MY", "page": 1})
    page_2 = client.get("/market/leaderboard", params={"market": "MY", "page": 2})
    assert page_1.status_code == 200
    assert page_2.status_code == 200
    body_1 = page_1.json()
    body_2 = page_2.json()
    assert body_1["page_size"] == 20
    assert body_2["page"] == 2
    assert body_1["items"] != body_2["items"] or body_2["items"] == []

    kw = client.get("/market/leaderboard", params={"market": "MY", "q": "手机壳"})
    assert kw.status_code == 200
    kw_body = kw.json()
    assert all("手机壳" in item["product_name"] for item in kw_body["items"])


def test_market_board_type_returns_different_content():
    sales = client.get("/market/leaderboard", params={"market": "MY", "board_type": "sales", "page": 1})
    new = client.get("/market/leaderboard", params={"market": "MY", "board_type": "new", "page": 1})
    hot = client.get("/market/leaderboard", params={"market": "MY", "board_type": "hot", "page": 1})

    assert sales.status_code == 200
    assert new.status_code == 200
    assert hot.status_code == 200

    sales_items = sales.json()["items"]
    new_items = new.json()["items"]
    hot_items = hot.json()["items"]
    assert len(sales_items) > 0
    assert len(new_items) > 0
    assert len(hot_items) > 0

    assert all(item["board_type"] == "sales" for item in sales_items)
    assert all(item["board_type"] == "new" for item in new_items)
    assert all(item["board_type"] == "hot" for item in hot_items)

    sales_names = {item["product_name"] for item in sales_items}
    new_names = {item["product_name"] for item in new_items}
    hot_names = {item["product_name"] for item in hot_items}
    assert sales_names != new_names
    assert sales_names != hot_names


def test_procurement_summary_defaults_to_full_budget():
    token = _register_or_login_player("13800138101")
    run = _create_running_run(token)

    response = client.get(
        f"/game/runs/{run['id']}/procurement/cart-summary",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["total_cash"] == run["initial_cash"]
    assert body["spent_total"] == 0
    assert body["remaining_cash"] == run["initial_cash"]


def test_procurement_create_order_persists_and_reduces_remaining_cash():
    token = _register_or_login_player("13800138102")
    run = _create_running_run(token)

    list_resp = client.get("/market/leaderboard", params={"market": "MY", "page": 1})
    assert list_resp.status_code == 200
    rows = list_resp.json()["items"]
    assert len(rows) >= 2

    payload = {
        "items": [
            {"product_id": rows[0]["id"], "quantity": 1000},
            {"product_id": rows[1]["id"], "quantity": 2000},
        ]
    }
    create_resp = client.post(
        f"/game/runs/{run['id']}/procurement/orders",
        headers={"Authorization": f"Bearer {token}"},
        json=payload,
    )
    assert create_resp.status_code == 201
    body = create_resp.json()
    assert body["order_id"] > 0
    assert body["total_amount"] > 0
    assert body["remaining_cash"] == run["initial_cash"] - body["total_amount"]

    summary_resp = client.get(
        f"/game/runs/{run['id']}/procurement/cart-summary",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert summary_resp.status_code == 200
    summary = summary_resp.json()
    assert summary["spent_total"] == body["total_amount"]
    assert summary["remaining_cash"] == run["initial_cash"] - body["total_amount"]

    history_resp = client.get(
        f"/game/runs/{run['id']}/procurement/orders",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert history_resp.status_code == 200
    history = history_resp.json()["orders"]
    assert len(history) == 1
    assert history[0]["total_amount"] == body["total_amount"]
    assert len(history[0]["items"]) == 2


def test_procurement_rejects_order_when_budget_insufficient():
    token = _register_or_login_player("13800138103")
    run = _create_running_run(token)
    list_resp = client.get("/market/leaderboard", params={"market": "MY", "page": 1})
    product = list_resp.json()["items"][0]

    response = client.post(
        f"/game/runs/{run['id']}/procurement/orders",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "items": [
                {"product_id": product["id"], "quantity": 1000000},
            ]
        },
    )
    assert response.status_code == 400


def test_procurement_rejects_order_when_quantity_below_minimum():
    token = _register_or_login_player("13800138104")
    run = _create_running_run(token)
    list_resp = client.get("/market/leaderboard", params={"market": "MY", "page": 1})
    product = list_resp.json()["items"][0]

    response = client.post(
        f"/game/runs/{run['id']}/procurement/orders",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "items": [
                {"product_id": product["id"], "quantity": 999},
            ]
        },
    )
    assert response.status_code == 422


def test_shopee_withdraw_transfers_to_game_cash():
    from app.db import SessionLocal
    from app.models import ShopeeFinanceLedgerEntry

    token = _register_or_login_player("13800138105")
    run = _create_running_run(token)

    bank_resp = client.post(
        f"/shopee/runs/{run['id']}/finance/bank-accounts",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "bank_name": "马来亚银行",
            "account_holder": "测试玩家",
            "account_no": "6222000012345678",
            "is_default": True,
        },
    )
    assert bank_resp.status_code == 200

    with SessionLocal() as db:
        db.add(
            ShopeeFinanceLedgerEntry(
                run_id=run["id"],
                user_id=run["user_id"],
                order_id=None,
                entry_type="adjustment",
                direction="in",
                amount=100,
                balance_after=100,
                status="completed",
                remark="test seed",
                credited_at=datetime.utcnow(),
            )
        )
        db.commit()

    withdraw_resp = client.post(
        f"/shopee/runs/{run['id']}/finance/withdraw",
        headers={"Authorization": f"Bearer {token}"},
        json={"amount": 50},
    )
    assert withdraw_resp.status_code == 200
    withdraw_body = withdraw_resp.json()
    assert withdraw_body["withdraw_rm"] == 50
    assert withdraw_body["credited_rmb"] == 87
    assert withdraw_body["wallet_balance"] == 50
    assert withdraw_body["exchange_rate"] == 1.74

    finance_resp = client.get(
        f"/shopee/runs/{run['id']}/finance/overview",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert finance_resp.status_code == 200
    assert finance_resp.json()["wallet_balance"] == 50

    summary_resp = client.get(
        f"/game/runs/{run['id']}/procurement/cart-summary",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert summary_resp.status_code == 200
    summary = summary_resp.json()
    assert summary["total_cash"] == 200087
    assert summary["remaining_cash"] == 200087


def test_shopee_withdraw_requires_default_bank_account():
    from app.db import SessionLocal
    from app.models import ShopeeFinanceLedgerEntry

    token = _register_or_login_player("13800138106")
    run = _create_running_run(token)

    bank_resp = client.post(
        f"/shopee/runs/{run['id']}/finance/bank-accounts",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "bank_name": "马来亚银行",
            "account_holder": "测试玩家",
            "account_no": "6222000099990000",
            "is_default": False,
        },
    )
    assert bank_resp.status_code == 200

    with SessionLocal() as db:
        db.add(
            ShopeeFinanceLedgerEntry(
                run_id=run["id"],
                user_id=run["user_id"],
                order_id=None,
                entry_type="adjustment",
                direction="in",
                amount=100,
                balance_after=100,
                status="completed",
                remark="test seed",
                credited_at=datetime.utcnow(),
            )
        )
        db.commit()

    withdraw_resp = client.post(
        f"/shopee/runs/{run['id']}/finance/withdraw",
        headers={"Authorization": f"Bearer {token}"},
        json={"amount": 50},
    )
    assert withdraw_resp.status_code == 400
    assert "默认银行卡" in withdraw_resp.text


def test_game_finance_details_tabs_return_income_and_expense():
    from app.db import SessionLocal
    from app.models import ShopeeFinanceLedgerEntry

    token = _register_or_login_player("13800138107")
    run = _create_running_run(token)

    bank_resp = client.post(
        f"/shopee/runs/{run['id']}/finance/bank-accounts",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "bank_name": "马来亚银行",
            "account_holder": "测试玩家",
            "account_no": "6222000077778888",
            "is_default": True,
        },
    )
    assert bank_resp.status_code == 200

    with SessionLocal() as db:
        db.add(
            ShopeeFinanceLedgerEntry(
                run_id=run["id"],
                user_id=run["user_id"],
                order_id=None,
                entry_type="adjustment",
                direction="in",
                amount=100,
                balance_after=100,
                status="completed",
                remark="test seed",
                credited_at=datetime.utcnow(),
            )
        )
        db.commit()

    withdraw_resp = client.post(
        f"/shopee/runs/{run['id']}/finance/withdraw",
        headers={"Authorization": f"Bearer {token}"},
        json={"amount": 40},
    )
    assert withdraw_resp.status_code == 200

    list_resp = client.get("/market/leaderboard", params={"market": "MY", "page": 1})
    product = list_resp.json()["items"][0]
    order_resp = client.post(
        f"/game/runs/{run['id']}/procurement/orders",
        headers={"Authorization": f"Bearer {token}"},
        json={"items": [{"product_id": product["id"], "quantity": 1000}]},
    )
    assert order_resp.status_code == 201

    income_resp = client.get(
        f"/game/runs/{run['id']}/finance/details",
        headers={"Authorization": f"Bearer {token}"},
        params={"tab": "income"},
    )
    assert income_resp.status_code == 200
    income_body = income_resp.json()
    assert income_body["tab"] == "income"
    assert income_body["total"] >= 1
    assert income_body["rows"][0]["direction"] == "in"

    expense_resp = client.get(
        f"/game/runs/{run['id']}/finance/details",
        headers={"Authorization": f"Bearer {token}"},
        params={"tab": "expense"},
    )
    assert expense_resp.status_code == 200
    expense_body = expense_resp.json()
    assert expense_body["tab"] == "expense"
    assert expense_body["total"] >= 1
    assert expense_body["rows"][0]["direction"] == "out"


def test_shopee_product_draft_flow_and_publish(monkeypatch):
    from app.api.routes import shopee as shopee_route

    monkeypatch.setattr(
        shopee_route,
        "_save_shopee_image",
        lambda _db, img: f"https://oss.example.com/{(img.filename or 'image.jpg').replace(' ', '_')}",
    )
    monkeypatch.setattr(
        shopee_route,
        "_save_shopee_video",
        lambda _db, video: f"https://oss.example.com/{(video.filename or 'video.mp4').replace(' ', '_')}",
    )

    token = _register_or_login_player("13800138201")
    run = _create_running_run(token)

    create_draft = client.post(
        f"/shopee/runs/{run['id']}/product-drafts",
        headers={"Authorization": f"Bearer {token}"},
        data={
            "title": "便携榨汁杯",
            "category": "厨房电器",
            "gtin": "6901234567890",
            "description": "支持 USB 充电，适合宿舍和办公室。",
            "cover_index": "0",
            "cover_index_34": "0",
        },
        files=[
            ("images", ("cover.jpg", b"mock-image-11", "image/jpeg")),
            ("images_34", ("cover34.jpg", b"mock-image-34", "image/jpeg")),
        ],
    )
    assert create_draft.status_code == 201
    draft_body = create_draft.json()
    assert draft_body["title"] == "便携榨汁杯"
    assert draft_body["gtin"] == "6901234567890"
    assert draft_body["image_count_11"] == 1
    assert draft_body["image_count_34"] == 1
    assert draft_body["cover_url"].startswith("https://oss.example.com/")

    draft_id = draft_body["id"]

    get_draft = client.get(
        f"/shopee/runs/{run['id']}/product-drafts/{draft_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert get_draft.status_code == 200
    get_body = get_draft.json()
    assert get_body["id"] == draft_id
    assert get_body["title"] == "便携榨汁杯"
    assert get_body["description"] == "支持 USB 充电，适合宿舍和办公室。"
    assert len(get_body["images_11"]) == 1
    assert len(get_body["images_34"]) == 1

    update_draft = client.put(
        f"/shopee/runs/{run['id']}/product-drafts/{draft_id}",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "title": "便携榨汁杯 Pro",
            "category": "厨房电器",
            "gtin": "6901234567890",
            "description": "支持 USB 充电，续航升级。",
        },
    )
    assert update_draft.status_code == 200
    assert update_draft.json()["title"] == "便携榨汁杯 Pro"

    append_assets = client.post(
        f"/shopee/runs/{run['id']}/product-drafts/{draft_id}/assets",
        headers={"Authorization": f"Bearer {token}"},
        files=[
            ("images", ("more.jpg", b"more-image-11", "image/jpeg")),
            ("images_34", ("more34.jpg", b"more-image-34", "image/jpeg")),
            ("video", ("intro.mp4", b"mock-video", "video/mp4")),
        ],
    )
    assert append_assets.status_code == 200
    assets_body = append_assets.json()
    assert assets_body["image_count_11"] == 2
    assert assets_body["image_count_34"] == 2
    assert assets_body["video_url"].endswith("intro.mp4")

    save_and_delist = client.post(
        f"/shopee/runs/{run['id']}/product-drafts/{draft_id}/publish",
        headers={"Authorization": f"Bearer {token}"},
        data={"status_value": "unpublished"},
    )
    assert save_and_delist.status_code == 201
    delist_body = save_and_delist.json()
    assert delist_body["status"] == "unpublished"
    assert delist_body["draft_id"] == draft_id


def test_shopee_draft_publish_live(monkeypatch):
    from app.api.routes import shopee as shopee_route

    monkeypatch.setattr(
        shopee_route,
        "_save_shopee_image",
        lambda _db, img: f"https://oss.example.com/{(img.filename or 'image.jpg').replace(' ', '_')}",
    )

    token = _register_or_login_player("13800138202")
    run = _create_running_run(token)

    create_draft = client.post(
        f"/shopee/runs/{run['id']}/product-drafts",
        headers={"Authorization": f"Bearer {token}"},
        data={
            "title": "蓝牙耳机",
            "category": "美妆个护",
            "gtin": "1234567890123",
            "cover_index": "0",
        },
        files=[("images", ("cover.jpg", b"mock-image-11", "image/jpeg"))],
    )
    assert create_draft.status_code == 201
    draft_id = create_draft.json()["id"]

    publish_live = client.post(
        f"/shopee/runs/{run['id']}/product-drafts/{draft_id}/publish",
        headers={"Authorization": f"Bearer {token}"},
        data={"status_value": "unpublished"},
    )
    assert publish_live.status_code == 201
    publish_body = publish_live.json()
    assert publish_body["status"] == "unpublished"
    assert publish_body["listing_id"] > 0

    products = client.get(
        f"/shopee/runs/{run['id']}/products",
        headers={"Authorization": f"Bearer {token}"},
        params={"type": "all"},
    )
    assert products.status_code == 200
    rows = products.json()["listings"]
    assert any(row["id"] == publish_body["listing_id"] for row in rows)


def test_shopee_listing_quality_scored_after_publish(monkeypatch):
    from app.api.routes import shopee as shopee_route

    monkeypatch.setattr(
        shopee_route,
        "_save_shopee_image",
        lambda _db, img: f"https://oss.example.com/{(img.filename or 'image.jpg').replace(' ', '_')}",
    )

    token = _register_or_login_player("13800138235")
    run = _create_running_run(token)

    draft_resp = client.post(
        f"/shopee/runs/{run['id']}/product-drafts",
        headers={"Authorization": f"Bearer {token}"},
        data={
            "title": "质量评分测试商品",
            "category": "美妆个护",
            "gtin": "8877665544332",
            "cover_index": "0",
        },
        files=[("images", ("cover.jpg", b"mock-image-11", "image/jpeg"))],
    )
    assert draft_resp.status_code == 201
    draft_id = int(draft_resp.json()["id"])

    publish_resp = client.post(
        f"/shopee/runs/{run['id']}/product-drafts/{draft_id}/publish",
        headers={"Authorization": f"Bearer {token}"},
        data={"status_value": "unpublished", "price": "129", "stock_available": "100"},
    )
    assert publish_resp.status_code == 201
    listing_id = int(publish_resp.json()["listing_id"])

    products = client.get(
        f"/shopee/runs/{run['id']}/products",
        headers={"Authorization": f"Bearer {token}"},
        params={"type": "all"},
    )
    assert products.status_code == 200
    row = next((item for item in products.json()["listings"] if int(item["id"]) == listing_id), None)
    assert row is not None
    assert isinstance(row.get("quality_total_score"), int)
    assert row.get("quality_status") in {"内容待完善", "内容合格", "内容优秀"}

    quality = client.get(
        f"/shopee/runs/{run['id']}/listings/{listing_id}/quality",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert quality.status_code == 200
    quality_body = quality.json()
    assert int(quality_body["listing_id"]) == listing_id
    assert isinstance(quality_body["total_score"], int)
    assert quality_body["quality_status"] in {"内容待完善", "内容合格", "内容优秀"}


def test_shopee_listing_quality_recompute_creates_new_snapshot(monkeypatch):
    from app.api.routes import shopee as shopee_route
    from app.db import SessionLocal
    from app.models import ShopeeListingQualityScore

    monkeypatch.setattr(
        shopee_route,
        "_save_shopee_image",
        lambda _db, img: f"https://oss.example.com/{(img.filename or 'image.jpg').replace(' ', '_')}",
    )

    token = _register_or_login_player("13800138236")
    run = _create_running_run(token)
    draft_resp = client.post(
        f"/shopee/runs/{run['id']}/product-drafts",
        headers={"Authorization": f"Bearer {token}"},
        data={
            "title": "质量重评测试商品",
            "category": "美妆个护",
            "gtin": "7766554433221",
            "cover_index": "0",
        },
        files=[("images", ("cover.jpg", b"mock-image-11", "image/jpeg"))],
    )
    assert draft_resp.status_code == 201
    draft_id = int(draft_resp.json()["id"])

    publish_resp = client.post(
        f"/shopee/runs/{run['id']}/product-drafts/{draft_id}/publish",
        headers={"Authorization": f"Bearer {token}"},
        data={"status_value": "unpublished", "price": "139", "stock_available": "100"},
    )
    assert publish_resp.status_code == 201
    listing_id = int(publish_resp.json()["listing_id"])

    with SessionLocal() as db:
        before_count = (
            db.query(ShopeeListingQualityScore)
            .filter(ShopeeListingQualityScore.listing_id == listing_id)
            .count()
        )

    recompute_resp = client.post(
        f"/shopee/runs/{run['id']}/listings/{listing_id}/quality/recompute",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert recompute_resp.status_code == 200
    payload = recompute_resp.json()
    assert int(payload["listing_id"]) == listing_id
    assert payload["quality_status"] in {"内容待完善", "内容合格", "内容优秀"}

    with SessionLocal() as db:
        after_rows = (
            db.query(ShopeeListingQualityScore)
            .filter(ShopeeListingQualityScore.listing_id == listing_id)
            .order_by(ShopeeListingQualityScore.id.asc())
            .all()
        )
        assert len(after_rows) >= before_count + 1
        latest_rows = [row for row in after_rows if bool(row.is_latest)]
        assert len(latest_rows) == 1


def _create_live_listing_for_run(monkeypatch, token: str, run_id: int, *, stock: int, price: int = 129) -> int:
    from app.api.routes import shopee as shopee_route

    monkeypatch.setattr(
        shopee_route,
        "_save_shopee_image",
        lambda _db, img: f"https://oss.example.com/{(img.filename or 'image.jpg').replace(' ', '_')}",
    )

    create_draft = client.post(
        f"/shopee/runs/{run_id}/product-drafts",
        headers={"Authorization": f"Bearer {token}"},
        data={
            "title": "模拟订单测试商品",
            "category": "美妆个护",
            "gtin": "9988776655443",
            "cover_index": "0",
        },
        files=[("images", ("cover.jpg", b"mock-image-11", "image/jpeg"))],
    )
    assert create_draft.status_code == 201
    draft_id = create_draft.json()["id"]

    publish_live = client.post(
        f"/shopee/runs/{run_id}/product-drafts/{draft_id}/publish",
        headers={"Authorization": f"Bearer {token}"},
        data={
            "status_value": "live",
            "quality_status": "内容合格",
            "price": str(price),
            "stock_available": str(stock),
            "shipping_standard": "true",
        },
    )
    assert publish_live.status_code == 201
    return int(publish_live.json()["listing_id"])


def _insert_live_listing_for_run(run_id: int, *, stock: int, price: int = 129) -> int:
    from app.db import SessionLocal
    from app.models import GameRun, ShopeeListing

    with SessionLocal() as db:
        run_row = db.query(GameRun).filter(GameRun.id == run_id).first()
        assert run_row is not None
        listing = ShopeeListing(
            run_id=run_row.id,
            user_id=run_row.user_id,
            title="套餐优惠测试商品",
            category_id=1,
            category="美妆个护",
            status="live",
            quality_status="qualified",
            stock_available=stock,
            sales_count=0,
            price=price,
            original_price=price,
            cover_url="https://oss.example.com/bundle-cover.jpg",
            sku_code=f"BUNDLE-{run_id}-{stock}",
        )
        db.add(listing)
        db.commit()
        db.refresh(listing)
        return int(listing.id)


def test_shopee_bundle_create_bootstrap_returns_defaults(monkeypatch):
    token = _register_or_login_player("13800138231")
    run = _create_running_run(token, duration_days=30)
    _insert_live_listing_for_run(run["id"], stock=25, price=109)

    resp = client.get(
        f"/shopee/runs/{run['id']}/marketing/bundle/create/bootstrap",
        headers={"Authorization": f"Bearer {token}"},
        params={"campaign_type": "bundle"},
    )
    assert resp.status_code == 200
    payload = resp.json()
    assert payload["meta"]["campaign_type"] == "bundle"
    assert payload["form"]["name_max_length"] == 25
    assert payload["form"]["bundle_type"] == "percent"
    assert payload["rules"]["purchase_limit_range"] == [1, 999]
    assert len(payload["form"]["tiers"]) == 1
    assert payload["product_picker"]["default_page_size"] == 20


def test_shopee_bundle_campaign_create_and_list(monkeypatch):
    token = _register_or_login_player("13800138232")
    run = _create_running_run(token, duration_days=30)
    listing_id = _insert_live_listing_for_run(run["id"], stock=40, price=159)

    eligible_resp = client.get(
        f"/shopee/runs/{run['id']}/marketing/bundle/eligible-products",
        headers={"Authorization": f"Bearer {token}"},
        params={"page": 1, "page_size": 20},
    )
    assert eligible_resp.status_code == 200
    eligible_payload = eligible_resp.json()
    selected_item = next((item for item in eligible_payload["items"] if int(item["listing_id"]) == listing_id), None)
    assert selected_item is not None

    create_resp = client.post(
        f"/shopee/runs/{run['id']}/marketing/bundle/campaigns",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "campaign_type": "bundle",
            "campaign_name": "护肤套装满件折扣",
            "start_at": "2026-04-15T11:00",
            "end_at": "2026-04-20T11:00",
            "bundle_type": "percent",
            "purchase_limit": 3,
            "tiers": [
                {"tier_no": 1, "buy_quantity": 2, "discount_value": 10},
                {"tier_no": 2, "buy_quantity": 3, "discount_value": 15},
            ],
            "items": [
                {
                    "listing_id": selected_item["listing_id"],
                    "variant_id": selected_item["variant_id"],
                    "product_name": selected_item["product_name"],
                    "variant_name": selected_item["variant_name"],
                    "image_url": selected_item["image_url"],
                    "sku": selected_item["sku"],
                    "original_price": selected_item["original_price"],
                    "stock_available": selected_item["stock_available"],
                }
            ],
        },
    )
    assert create_resp.status_code == 201
    create_payload = create_resp.json()
    assert create_payload["campaign_name"] == "护肤套装满件折扣"
    assert create_payload["campaign_status"] in {"upcoming", "ongoing"}
    assert create_payload["item_count"] == 1

    list_resp = client.get(
        f"/shopee/runs/{run['id']}/marketing/discount/bootstrap",
        headers={"Authorization": f"Bearer {token}"},
        params={"discount_type": "bundle", "page": 1, "page_size": 10},
    )
    assert list_resp.status_code == 200
    list_payload = list_resp.json()
    assert any(item["campaign_type"] == "bundle" for item in list_payload["list"]["items"])


def test_admin_simulate_orders_generates_orders_and_visible_to_player(monkeypatch):
    player_token = _register_or_login_player("13800138211")
    run = _create_running_run(player_token, duration_days=7)
    _create_live_listing_for_run(monkeypatch, player_token, run["id"], stock=30, price=99)

    admin_login = client.post("/auth/login", json={"username": "yzcube", "password": "yzcube123"})
    assert admin_login.status_code == 200
    admin_token = admin_login.json()["access_token"]

    simulate_resp = client.post(
        f"/game/admin/runs/{run['id']}/orders/simulate",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert simulate_resp.status_code == 200
    payload = simulate_resp.json()
    assert payload["generated_order_count"] > 0
    assert payload["active_buyer_count"] > 0

    orders_resp = client.get(
        f"/shopee/runs/{run['id']}/orders",
        headers={"Authorization": f"Bearer {player_token}"},
        params={"type": "all"},
    )
    assert orders_resp.status_code == 200
    orders_payload = orders_resp.json()
    assert orders_payload["total"] >= payload["generated_order_count"]
    assert orders_payload["simulated_recent_1h"] >= payload["generated_order_count"]


def test_admin_simulate_orders_skips_when_no_live_products():
    player_token = _register_or_login_player("13800138212")
    run = _create_running_run(player_token, duration_days=7)

    admin_login = client.post("/auth/login", json={"username": "yzcube", "password": "yzcube123"})
    assert admin_login.status_code == 200
    admin_token = admin_login.json()["access_token"]

    simulate_resp = client.post(
        f"/game/admin/runs/{run['id']}/orders/simulate",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert simulate_resp.status_code == 200
    payload = simulate_resp.json()
    assert payload["generated_order_count"] == 0
    assert "no_live_products" in payload["skip_reasons"]


def test_admin_simulate_orders_skips_when_no_stock(monkeypatch):
    player_token = _register_or_login_player("13800138213")
    run = _create_running_run(player_token, duration_days=7)
    _create_live_listing_for_run(monkeypatch, player_token, run["id"], stock=0, price=99)

    admin_login = client.post("/auth/login", json={"username": "yzcube", "password": "yzcube123"})
    assert admin_login.status_code == 200
    admin_token = admin_login.json()["access_token"]

    simulate_resp = client.post(
        f"/game/admin/runs/{run['id']}/orders/simulate",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert simulate_resp.status_code == 200
    payload = simulate_resp.json()
    assert payload["generated_order_count"] == 0
    assert "no_stock" in payload["skip_reasons"]


def test_shopee_products_list_allows_finished_run_and_returns_existing_listings():
    from app.db import SessionLocal
    from app.models import GameRun, ShopeeListing, ShopeeListingVariant

    player_token = _register_or_login_player("13800138224")
    run = _create_running_run(player_token, duration_days=365)

    with SessionLocal() as db:
        run_row = db.query(GameRun).filter(GameRun.id == run["id"]).first()
        assert run_row is not None
        run_row.status = "finished"

        listing = ShopeeListing(
            run_id=run_row.id,
            user_id=run_row.user_id,
            title="历史对局商品可见性测试",
            category_id=1,
            category="测试类目",
            status="live",
            quality_status="qualified",
            stock_available=10,
            sales_count=3,
            price=199,
            original_price=299,
            cover_url=None,
        )
        db.add(listing)
        db.flush()
        db.add(
            ShopeeListingVariant(
                listing_id=listing.id,
                option_value="默认款",
                option_note=None,
                price=199,
                stock=10,
                sales_count=3,
                oversell_limit=50,
                oversell_used=0,
                sku="SKU-HISTORY-READ",
                image_url=None,
                sort_order=1,
            )
        )
        db.commit()
        listing_id = listing.id

    resp = client.get(
        f"/shopee/runs/{run['id']}/products",
        headers={"Authorization": f"Bearer {player_token}"},
        params={"type": "all", "page": 1, "page_size": 20},
    )
    assert resp.status_code == 200
    payload = resp.json()
    assert int(payload["total"]) >= 1
    target = next((row for row in payload["listings"] if int(row["id"]) == listing_id), None)
    assert target is not None
    assert target["title"] == "历史对局商品可见性测试"
    assert len(target.get("variants") or []) == 1
    assert target["variants"][0]["sku"] == "SKU-HISTORY-READ"


def test_cancel_order_rebalances_other_backorder_for_same_product():
    from app.db import SessionLocal
    from app.models import (
        GameRun,
        InventoryLot,
        LogisticsShipment,
        MarketProduct,
        ShopeeListing,
        ShopeeListingVariant,
        ShopeeOrder,
        ShopeeOrderItem,
        WarehouseInboundOrder,
        WarehouseStrategy,
    )

    player_token = _register_or_login_player("13800138220")
    run = _create_running_run(player_token, duration_days=365)

    with SessionLocal() as db:
        run_row = db.query(GameRun).filter(GameRun.id == run["id"]).first()
        assert run_row is not None
        product = (
            db.query(MarketProduct)
            .filter(MarketProduct.market == "MY")
            .order_by(MarketProduct.id.asc())
            .first()
        )
        assert product is not None

        strategy = WarehouseStrategy(
            run_id=run_row.id,
            user_id=run_row.user_id,
            market="MY",
            warehouse_mode="official",
            warehouse_location="near_kl",
            one_time_cost=0,
            inbound_cost=0,
            rent_cost=0,
            total_cost=0,
            delivery_eta_score=85,
            fulfillment_accuracy=0.95,
            warehouse_cost_per_order=8,
            status="active",
        )
        db.add(strategy)
        db.flush()

        shipment = LogisticsShipment(
            run_id=run_row.id,
            user_id=run_row.user_id,
            forwarder_key="standard",
            forwarder_label="标准线（马来）",
            customs_key="normal",
            customs_label="标准清关",
            cargo_value=2000,
            logistics_fee=120,
            customs_fee=40,
            total_fee=160,
            transport_days=12,
            customs_days=4,
        )
        db.add(shipment)
        db.flush()

        inbound = WarehouseInboundOrder(
            run_id=run_row.id,
            strategy_id=strategy.id,
            shipment_id=shipment.id,
            total_quantity=2,
            total_value=2000,
            status="completed",
            completed_at=datetime.utcnow(),
        )
        db.add(inbound)
        db.flush()

        lot = InventoryLot(
            run_id=run_row.id,
            product_id=product.id,
            inbound_order_id=inbound.id,
            quantity_available=0,
            quantity_locked=0,
            reserved_qty=2,
            backorder_qty=0,
            unit_cost=int(product.supplier_price or 100),
        )
        db.add(lot)
        db.flush()

        listing = ShopeeListing(
            run_id=run_row.id,
            user_id=run_row.user_id,
            title=f"{product.product_name}-回补测试",
            category_id=1,
            category="测试类目",
            status="live",
            quality_status="qualified",
            stock_available=0,
            sales_count=4,
            product_id=product.id,
        )
        db.add(listing)
        db.flush()

        variant = ShopeeListingVariant(
            listing_id=listing.id,
            option_value="默认款",
            sku=f"SKU-{listing.id}",
            price=199,
            stock=0,
            sales_count=4,
            oversell_limit=100,
            oversell_used=2,
            sort_order=1,
        )
        db.add(variant)
        db.flush()

        backorder_order = ShopeeOrder(
            run_id=run_row.id,
            user_id=run_row.user_id,
            order_no=f"SIM_BACKORDER_{run_row.id}",
            buyer_name="Buyer-A",
            buyer_payment=398,
            order_type="order",
            listing_id=listing.id,
            variant_id=variant.id,
            type_bucket="toship",
            process_status="processing",
            stock_fulfillment_status="backorder",
            backorder_qty=2,
            shipping_priority="today",
            shipping_channel="标准快递",
            destination="吉隆坡",
            countdown_text="请在24小时内处理",
            action_text="查看详情",
            ship_by_date=datetime.utcnow() + timedelta(days=1),
            ship_by_at=datetime.utcnow() + timedelta(days=1),
            must_restock_before_at=datetime.utcnow() + timedelta(hours=48),
        )
        db.add(backorder_order)
        db.flush()
        db.add(
            ShopeeOrderItem(
                order_id=backorder_order.id,
                product_name=listing.title,
                variant_name=variant.option_value,
                quantity=2,
                unit_price=199,
                image_url=None,
            )
        )

        to_cancel_order = ShopeeOrder(
            run_id=run_row.id,
            user_id=run_row.user_id,
            order_no=f"SIM_CANCEL_{run_row.id}",
            buyer_name="Buyer-B",
            buyer_payment=398,
            order_type="order",
            listing_id=listing.id,
            variant_id=variant.id,
            type_bucket="toship",
            process_status="processing",
            stock_fulfillment_status="in_stock",
            backorder_qty=0,
            shipping_priority="today",
            shipping_channel="标准快递",
            destination="吉隆坡",
            countdown_text="请在24小时内处理",
            action_text="查看详情",
            ship_by_date=datetime.utcnow() + timedelta(days=1),
            ship_by_at=datetime.utcnow() + timedelta(days=1),
        )
        db.add(to_cancel_order)
        db.flush()
        db.add(
            ShopeeOrderItem(
                order_id=to_cancel_order.id,
                product_name=listing.title,
                variant_name=variant.option_value,
                quantity=2,
                unit_price=199,
                image_url=None,
            )
        )

        db.commit()
        backorder_order_id = backorder_order.id
        to_cancel_order_id = to_cancel_order.id

    cancel_resp = client.post(
        f"/shopee/runs/{run['id']}/orders/{to_cancel_order_id}/cancel",
        headers={"Authorization": f"Bearer {player_token}"},
        json={"reason": "manual_test"},
    )
    assert cancel_resp.status_code == 200

    with SessionLocal() as db:
        refreshed = db.query(ShopeeOrder).filter(ShopeeOrder.id == backorder_order_id).first()
        assert refreshed is not None
        assert refreshed.stock_fulfillment_status == "restocked"
        assert int(refreshed.backorder_qty or 0) == 0


def test_shopee_cancel_order_service_is_idempotent_for_same_order():
    from app.db import SessionLocal
    from app.models import (
        GameRun,
        InventoryStockMovement,
        ShopeeListing,
        ShopeeListingVariant,
        ShopeeOrder,
        ShopeeOrderItem,
        ShopeeOrderLogisticsEvent,
    )
    from app.services.shopee_order_cancellation import cancel_order as service_cancel_order

    player_token = _register_or_login_player("13800138225")
    run = _create_running_run(player_token, duration_days=365)

    with SessionLocal() as db:
        run_row = db.query(GameRun).filter(GameRun.id == run["id"]).first()
        assert run_row is not None

        listing = ShopeeListing(
            run_id=run_row.id,
            user_id=run_row.user_id,
            title="取消幂等测试商品",
            category_id=1,
            category="测试类目",
            status="live",
            quality_status="qualified",
            stock_available=5,
            sales_count=2,
            product_id=None,
        )
        db.add(listing)
        db.flush()

        variant = ShopeeListingVariant(
            listing_id=listing.id,
            option_value="默认款",
            sku=f"SKU-IDEMP-{listing.id}",
            price=199,
            stock=5,
            sales_count=2,
            oversell_limit=100,
            oversell_used=0,
            sort_order=1,
        )
        db.add(variant)
        db.flush()

        order = ShopeeOrder(
            run_id=run_row.id,
            user_id=run_row.user_id,
            order_no=f"SIM_CANCEL_IDEMP_{run_row.id}",
            buyer_name="Buyer-Idempotent",
            buyer_payment=398,
            order_type="order",
            listing_id=listing.id,
            variant_id=variant.id,
            type_bucket="toship",
            process_status="processing",
            stock_fulfillment_status="in_stock",
            backorder_qty=0,
            shipping_priority="today",
            shipping_channel="标准快递",
            destination="吉隆坡",
            countdown_text="请在24小时内处理",
            action_text="查看详情",
            ship_by_date=datetime.utcnow() + timedelta(days=1),
            ship_by_at=datetime.utcnow() + timedelta(days=1),
        )
        db.add(order)
        db.flush()
        db.add(
            ShopeeOrderItem(
                order_id=order.id,
                product_name=listing.title,
                variant_name=variant.option_value,
                quantity=2,
                unit_price=199,
                image_url=None,
            )
        )
        db.flush()

        cancel_time = datetime.utcnow()
        service_cancel_order(
            db,
            run_id=run_row.id,
            user_id=run_row.user_id,
            order=order,
            cancel_time=cancel_time,
            reason="idempotent_test",
            source="manual_debug",
        )
        service_cancel_order(
            db,
            run_id=run_row.id,
            user_id=run_row.user_id,
            order=order,
            cancel_time=cancel_time + timedelta(seconds=1),
            reason="idempotent_test_again",
            source="manual_debug",
        )
        db.commit()

    with SessionLocal() as db:
        refreshed_order = db.query(ShopeeOrder).filter(ShopeeOrder.order_no == f"SIM_CANCEL_IDEMP_{run['id']}").first()
        assert refreshed_order is not None
        assert refreshed_order.type_bucket == "cancelled"

        movement_count = (
            db.query(InventoryStockMovement)
            .filter(
                InventoryStockMovement.run_id == run["id"],
                InventoryStockMovement.biz_order_id == refreshed_order.id,
                InventoryStockMovement.movement_type == "cancel_release",
            )
            .count()
        )
        assert movement_count == 1

        cancel_event_count = (
            db.query(ShopeeOrderLogisticsEvent)
            .filter(
                ShopeeOrderLogisticsEvent.run_id == run["id"],
                ShopeeOrderLogisticsEvent.order_id == refreshed_order.id,
                ShopeeOrderLogisticsEvent.event_code == "cancelled_by_buyer",
            )
            .count()
        )
        assert cancel_event_count == 1


def test_shopee_orders_list_self_heals_legacy_backorder_when_inventory_available():
    from app.db import SessionLocal
    from app.models import (
        GameRun,
        InventoryLot,
        LogisticsShipment,
        MarketProduct,
        ShopeeListing,
        ShopeeListingVariant,
        ShopeeOrder,
        ShopeeOrderItem,
        WarehouseInboundOrder,
        WarehouseStrategy,
    )

    player_token = _register_or_login_player("13800138221")
    run = _create_running_run(player_token, duration_days=365)

    with SessionLocal() as db:
        run_row = db.query(GameRun).filter(GameRun.id == run["id"]).first()
        assert run_row is not None
        product = (
            db.query(MarketProduct)
            .filter(MarketProduct.market == "MY")
            .order_by(MarketProduct.id.asc())
            .first()
        )
        assert product is not None
        strategy = WarehouseStrategy(
            run_id=run_row.id,
            user_id=run_row.user_id,
            market="MY",
            warehouse_mode="official",
            warehouse_location="near_kl",
            one_time_cost=0,
            inbound_cost=0,
            rent_cost=0,
            total_cost=0,
            delivery_eta_score=85,
            fulfillment_accuracy=0.95,
            warehouse_cost_per_order=8,
            status="active",
        )
        db.add(strategy)
        db.flush()

        shipment = LogisticsShipment(
            run_id=run_row.id,
            user_id=run_row.user_id,
            forwarder_key="standard",
            forwarder_label="标准线（马来）",
            customs_key="normal",
            customs_label="标准清关",
            cargo_value=2000,
            logistics_fee=120,
            customs_fee=40,
            total_fee=160,
            transport_days=12,
            customs_days=4,
        )
        db.add(shipment)
        db.flush()

        inbound = WarehouseInboundOrder(
            run_id=run_row.id,
            strategy_id=strategy.id,
            shipment_id=shipment.id,
            total_quantity=2,
            total_value=2000,
            status="completed",
            completed_at=datetime.utcnow(),
        )
        db.add(inbound)
        db.flush()

        listing = ShopeeListing(
            run_id=run_row.id,
            user_id=run_row.user_id,
            title=f"{product.product_name}-列表自愈测试",
            category_id=1,
            category="测试类目",
            status="live",
            quality_status="qualified",
            stock_available=0,
            sales_count=0,
            product_id=product.id,
        )
        db.add(listing)
        db.flush()

        variant = ShopeeListingVariant(
            listing_id=listing.id,
            option_value="默认款",
            sku=f"SKU-LIST-{listing.id}",
            price=199,
            stock=0,
            sales_count=0,
            oversell_limit=100,
            oversell_used=2,
            sort_order=1,
        )
        db.add(variant)
        db.flush()

        db.add(
                InventoryLot(
                    run_id=run_row.id,
                    product_id=product.id,
                    inbound_order_id=inbound.id,
                    quantity_available=2,
                quantity_locked=0,
                reserved_qty=0,
                backorder_qty=0,
                unit_cost=int(product.supplier_price or 100),
            )
        )

        backorder_order = ShopeeOrder(
            run_id=run_row.id,
            user_id=run_row.user_id,
            order_no=f"SIM_LEGACY_BACKORDER_{run_row.id}",
            buyer_name="Buyer-Legacy",
            buyer_payment=398,
            order_type="order",
            listing_id=listing.id,
            variant_id=variant.id,
            type_bucket="toship",
            process_status="processing",
            stock_fulfillment_status="backorder",
            backorder_qty=2,
            shipping_priority="today",
            shipping_channel="标准快递",
            destination="吉隆坡",
            countdown_text="请在24小时内处理",
            action_text="查看详情",
            ship_by_date=datetime.utcnow() + timedelta(days=1),
            ship_by_at=datetime.utcnow() + timedelta(days=1),
            must_restock_before_at=datetime.utcnow() + timedelta(hours=48),
        )
        db.add(backorder_order)
        db.flush()
        db.add(
            ShopeeOrderItem(
                order_id=backorder_order.id,
                product_name=listing.title,
                variant_name=variant.option_value,
                quantity=2,
                unit_price=199,
                image_url=None,
            )
        )

        db.commit()
        backorder_order_id = backorder_order.id

    list_resp = client.get(
        f"/shopee/runs/{run['id']}/orders",
        headers={"Authorization": f"Bearer {player_token}"},
        params={"type": "toship"},
    )
    assert list_resp.status_code == 200

    with SessionLocal() as db:
        refreshed = db.query(ShopeeOrder).filter(ShopeeOrder.id == backorder_order_id).first()
        assert refreshed is not None
        assert refreshed.stock_fulfillment_status == "restocked"
        assert int(refreshed.backorder_qty or 0) == 0


def test_finished_orders_readonly_projection_hides_backorder_without_db_write():
    from app.db import SessionLocal
    from app.models import (
        GameRun,
        InventoryLot,
        LogisticsShipment,
        MarketProduct,
        ShopeeListing,
        ShopeeListingVariant,
        ShopeeOrder,
        ShopeeOrderItem,
        WarehouseInboundOrder,
        WarehouseStrategy,
    )

    player_token = _register_or_login_player("13800138222")
    run = _create_running_run(player_token, duration_days=365)

    with SessionLocal() as db:
        run_row = db.query(GameRun).filter(GameRun.id == run["id"]).first()
        assert run_row is not None
        run_row.status = "finished"
        product = (
            db.query(MarketProduct)
            .filter(MarketProduct.market == "MY")
            .order_by(MarketProduct.id.asc())
            .first()
        )
        assert product is not None

        strategy = WarehouseStrategy(
            run_id=run_row.id,
            user_id=run_row.user_id,
            market="MY",
            warehouse_mode="official",
            warehouse_location="near_kl",
            one_time_cost=0,
            inbound_cost=0,
            rent_cost=0,
            total_cost=0,
            delivery_eta_score=85,
            fulfillment_accuracy=0.95,
            warehouse_cost_per_order=8,
            status="active",
        )
        db.add(strategy)
        db.flush()

        shipment = LogisticsShipment(
            run_id=run_row.id,
            user_id=run_row.user_id,
            forwarder_key="standard",
            forwarder_label="标准线（马来）",
            customs_key="normal",
            customs_label="标准清关",
            cargo_value=2000,
            logistics_fee=120,
            customs_fee=40,
            total_fee=160,
            transport_days=12,
            customs_days=4,
        )
        db.add(shipment)
        db.flush()

        inbound = WarehouseInboundOrder(
            run_id=run_row.id,
            strategy_id=strategy.id,
            shipment_id=shipment.id,
            total_quantity=2,
            total_value=2000,
            status="completed",
            completed_at=datetime.utcnow(),
        )
        db.add(inbound)
        db.flush()

        db.add(
            InventoryLot(
                run_id=run_row.id,
                product_id=product.id,
                inbound_order_id=inbound.id,
                quantity_available=2,
                quantity_locked=0,
                reserved_qty=0,
                backorder_qty=0,
                unit_cost=int(product.supplier_price or 100),
            )
        )

        listing = ShopeeListing(
            run_id=run_row.id,
            user_id=run_row.user_id,
            title=f"{product.product_name}-历史回溯投影测试",
            category_id=1,
            category="测试类目",
            status="live",
            quality_status="qualified",
            stock_available=0,
            sales_count=0,
            product_id=product.id,
        )
        db.add(listing)
        db.flush()

        variant = ShopeeListingVariant(
            listing_id=listing.id,
            option_value="默认款",
            sku=f"SKU-HISTORY-{listing.id}",
            price=199,
            stock=0,
            sales_count=0,
            oversell_limit=100,
            oversell_used=2,
            sort_order=1,
        )
        db.add(variant)
        db.flush()

        backorder_order = ShopeeOrder(
            run_id=run_row.id,
            user_id=run_row.user_id,
            order_no=f"SIM_FINISHED_BACKORDER_{run_row.id}",
            buyer_name="Buyer-Finished",
            buyer_payment=398,
            order_type="order",
            listing_id=listing.id,
            variant_id=variant.id,
            type_bucket="toship",
            process_status="processing",
            stock_fulfillment_status="backorder",
            backorder_qty=2,
            shipping_priority="today",
            shipping_channel="标准快递",
            destination="吉隆坡",
            countdown_text="请在24小时内处理",
            action_text="查看详情",
            ship_by_date=datetime.utcnow() + timedelta(days=1),
            ship_by_at=datetime.utcnow() + timedelta(days=1),
            must_restock_before_at=datetime.utcnow() + timedelta(hours=48),
        )
        db.add(backorder_order)
        db.flush()
        db.add(
            ShopeeOrderItem(
                order_id=backorder_order.id,
                product_name=listing.title,
                variant_name=variant.option_value,
                quantity=2,
                unit_price=199,
                image_url=None,
            )
        )
        db.commit()
        backorder_order_id = backorder_order.id

    list_resp = client.get(
        f"/shopee/runs/{run['id']}/orders",
        headers={"Authorization": f"Bearer {player_token}"},
        params={"type": "toship"},
    )
    assert list_resp.status_code == 200
    payload = list_resp.json()
    target = next((row for row in payload["orders"] if row["id"] == backorder_order_id), None)
    assert target is not None
    assert target["stock_fulfillment_status"] == "restocked"
    assert int(target["backorder_qty"] or 0) == 0

    detail_resp = client.get(
        f"/shopee/runs/{run['id']}/orders/{backorder_order_id}",
        headers={"Authorization": f"Bearer {player_token}"},
    )
    assert detail_resp.status_code == 200
    detail = detail_resp.json()
    assert detail["stock_fulfillment_status"] == "restocked"
    assert int(detail["backorder_qty"] or 0) == 0

    with SessionLocal() as db:
        unchanged = db.query(ShopeeOrder).filter(ShopeeOrder.id == backorder_order_id).first()
        assert unchanged is not None
        assert unchanged.stock_fulfillment_status == "backorder"
        assert int(unchanged.backorder_qty or 0) == 2


def test_finished_orders_readonly_projection_uses_listing_stock_without_product_mapping():
    from app.db import SessionLocal
    from app.models import GameRun, ShopeeListing, ShopeeListingVariant, ShopeeOrder, ShopeeOrderItem

    player_token = _register_or_login_player("13800138223")
    run = _create_running_run(player_token, duration_days=365)

    with SessionLocal() as db:
        run_row = db.query(GameRun).filter(GameRun.id == run["id"]).first()
        assert run_row is not None
        run_row.status = "finished"

        listing = ShopeeListing(
            run_id=run_row.id,
            user_id=run_row.user_id,
            title="无映射历史Listing回溯测试",
            category_id=1,
            category="测试类目",
            status="live",
            quality_status="qualified",
            stock_available=10,
            sales_count=0,
            product_id=None,
        )
        db.add(listing)
        db.flush()

        variant = ShopeeListingVariant(
            listing_id=listing.id,
            option_value="默认款",
            sku=f"SKU-NOMAP-{listing.id}",
            price=199,
            stock=8,
            sales_count=0,
            oversell_limit=100,
            oversell_used=6,
            sort_order=1,
        )
        db.add(variant)
        db.flush()

        backorder_order = ShopeeOrder(
            run_id=run_row.id,
            user_id=run_row.user_id,
            order_no=f"SIM_FINISHED_NOMAP_{run_row.id}",
            buyer_name="Buyer-NoMap",
            buyer_payment=398,
            order_type="order",
            listing_id=listing.id,
            variant_id=variant.id,
            type_bucket="toship",
            process_status="processing",
            stock_fulfillment_status="backorder",
            backorder_qty=2,
            shipping_priority="today",
            shipping_channel="标准快递",
            destination="吉隆坡",
            countdown_text="请在24小时内处理",
            action_text="查看详情",
            ship_by_date=datetime.utcnow() + timedelta(days=1),
            ship_by_at=datetime.utcnow() + timedelta(days=1),
            must_restock_before_at=datetime.utcnow() + timedelta(hours=48),
        )
        db.add(backorder_order)
        db.flush()
        db.add(
            ShopeeOrderItem(
                order_id=backorder_order.id,
                product_name=listing.title,
                variant_name=variant.option_value,
                quantity=2,
                unit_price=199,
                image_url=None,
            )
        )
        db.commit()
        backorder_order_id = backorder_order.id

    list_resp = client.get(
        f"/shopee/runs/{run['id']}/orders",
        headers={"Authorization": f"Bearer {player_token}"},
        params={"type": "toship"},
    )
    assert list_resp.status_code == 200
    payload = list_resp.json()
    target = next((row for row in payload["orders"] if row["id"] == backorder_order_id), None)
    assert target is not None
    assert target["stock_fulfillment_status"] == "restocked"
    assert int(target["backorder_qty"] or 0) == 0

    with SessionLocal() as db:
        unchanged = db.query(ShopeeOrder).filter(ShopeeOrder.id == backorder_order_id).first()
        assert unchanged is not None
        assert unchanged.stock_fulfillment_status == "backorder"
        assert int(unchanged.backorder_qty or 0) == 2


def test_shopee_orders_list_allows_finished_run_and_skips_auto_writes(monkeypatch):
    from app.api.routes import shopee as shopee_route
    from app.db import SessionLocal
    from app.models import GameRun

    player_token = _register_or_login_player("13800138131")
    run = _create_running_run(player_token, duration_days=7)

    with SessionLocal() as db:
        row = db.query(GameRun).filter(GameRun.id == run["id"]).first()
        assert row is not None
        row.created_at = datetime.utcnow() - timedelta(days=8)
        db.commit()

    called: list[str] = []
    monkeypatch.setattr(
        shopee_route,
        "_auto_simulate_orders_by_game_hour",
        lambda *_args, **_kwargs: called.append("simulate"),
        raising=False,
    )
    monkeypatch.setattr(
        shopee_route,
        "_auto_cancel_overdue_orders_by_tick",
        lambda *_args, **_kwargs: called.append("cancel"),
        raising=False,
    )
    monkeypatch.setattr(
        shopee_route,
        "_auto_progress_shipping_orders_by_tick",
        lambda *_args, **_kwargs: called.append("progress"),
        raising=False,
    )
    monkeypatch.setattr(
        shopee_route,
        "_backfill_income_for_completed_orders",
        lambda *_args, **_kwargs: called.append("backfill"),
        raising=False,
    )

    resp = client.get(
        f"/shopee/runs/{run['id']}/orders",
        headers={"Authorization": f"Bearer {player_token}"},
        params={"type": "all"},
    )
    assert resp.status_code == 200
    assert called == []


def test_simulate_shopee_orders_rejects_finished_run():
    from app.db import SessionLocal
    from app.models import GameRun

    player_token = _register_or_login_player("13800138132")
    run = _create_running_run(player_token, duration_days=7)

    with SessionLocal() as db:
        row = db.query(GameRun).filter(GameRun.id == run["id"]).first()
        assert row is not None
        row.created_at = datetime.utcnow() - timedelta(days=8)
        db.commit()

    resp = client.post(
        f"/shopee/runs/{run['id']}/orders/simulate",
        headers={"Authorization": f"Bearer {player_token}"},
    )
    assert resp.status_code == 400
    assert "已结束" in str(resp.json().get("detail", ""))


def test_admin_simulate_rejects_finished_run():
    from app.db import SessionLocal
    from app.models import GameRun

    player_token = _register_or_login_player("13800138133")
    run = _create_running_run(player_token, duration_days=7)
    admin_login = client.post("/auth/login", json={"username": "yzcube", "password": "yzcube123"})
    assert admin_login.status_code == 200
    admin_token = admin_login.json()["access_token"]

    with SessionLocal() as db:
        row = db.query(GameRun).filter(GameRun.id == run["id"]).first()
        assert row is not None
        row.created_at = datetime.utcnow() - timedelta(days=8)
        db.commit()

    resp = client.post(
        f"/game/admin/runs/{run['id']}/orders/simulate",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 400
    assert "已结束" in str(resp.json().get("detail", ""))


def test_shopee_finance_overview_allows_finished_run_and_skips_backfill(monkeypatch):
    from app.api.routes import shopee as shopee_route
    from app.db import SessionLocal
    from app.models import GameRun

    player_token = _register_or_login_player("13800138134")
    run = _create_running_run(player_token, duration_days=7)

    with SessionLocal() as db:
        row = db.query(GameRun).filter(GameRun.id == run["id"]).first()
        assert row is not None
        row.created_at = datetime.utcnow() - timedelta(days=8)
        db.commit()

    called: list[str] = []
    monkeypatch.setattr(
        shopee_route,
        "_backfill_income_for_completed_orders",
        lambda *_args, **_kwargs: called.append("backfill"),
        raising=False,
    )

    resp = client.get(
        f"/shopee/runs/{run['id']}/finance/overview",
        headers={"Authorization": f"Bearer {player_token}"},
    )
    assert resp.status_code == 200
    assert called == []


def test_shopee_bank_accounts_list_allows_finished_run():
    from app.db import SessionLocal
    from app.models import GameRun

    player_token = _register_or_login_player("13800138151")
    run = _create_running_run(player_token, duration_days=7)

    create_resp = client.post(
        f"/shopee/runs/{run['id']}/finance/bank-accounts",
        headers={"Authorization": f"Bearer {player_token}"},
        json={
            "bank_name": "马来亚银行",
            "account_holder": "历史对局玩家",
            "account_no": "6222000011112222",
            "is_default": True,
        },
    )
    assert create_resp.status_code == 200
    created_id = create_resp.json()["id"]

    with SessionLocal() as db:
        row = db.query(GameRun).filter(GameRun.id == run["id"]).first()
        assert row is not None
        row.status = "finished"
        db.commit()

    list_resp = client.get(
        f"/shopee/runs/{run['id']}/finance/bank-accounts",
        headers={"Authorization": f"Bearer {player_token}"},
    )
    assert list_resp.status_code == 200
    payload = list_resp.json()
    assert payload["total"] >= 1
    assert any(item["id"] == created_id for item in payload["rows"])


def test_shopee_orders_list_uses_cached_response_when_available(monkeypatch):
    from app.api.routes import shopee as shopee_route

    player_token = _register_or_login_player("13800138214")
    run = _create_running_run(player_token)

    # Keep endpoint side-effect free for cache-hit verification.
    monkeypatch.setattr(shopee_route, "_auto_simulate_orders_by_game_hour", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(shopee_route, "_auto_cancel_overdue_orders_by_tick", lambda *_args, **_kwargs: [])
    monkeypatch.setattr(shopee_route, "_auto_progress_shipping_orders_by_tick", lambda *_args, **_kwargs: [])
    monkeypatch.setattr(shopee_route, "_backfill_income_for_completed_orders", lambda *_args, **_kwargs: 0)

    cached_payload = {
        "counts": {
            "all": 9,
            "unpaid": 0,
            "toship": 0,
            "shipping": 0,
            "completed": 0,
            "return_refund_cancel": 0,
        },
        "page": 1,
        "page_size": 20,
        "total": 9,
        "simulated_recent_1h": 0,
        "last_simulated_at": None,
        "orders": [],
    }
    monkeypatch.setattr(shopee_route, "_get_shopee_orders_cache_payload", lambda **_kwargs: cached_payload, raising=False)

    orders_resp = client.get(
        f"/shopee/runs/{run['id']}/orders",
        headers={"Authorization": f"Bearer {player_token}"},
        params={"type": "all"},
    )
    assert orders_resp.status_code == 200
    assert orders_resp.json()["total"] == 9


def test_simulate_shopee_orders_invalidates_orders_cache(monkeypatch):
    from app.api.routes import shopee as shopee_route

    player_token = _register_or_login_player("13800138215")
    run = _create_running_run(player_token)

    called: list[tuple[int, int]] = []
    monkeypatch.setattr(
        shopee_route,
        "_invalidate_shopee_orders_cache_for_user",
        lambda *, run_id, user_id: called.append((run_id, user_id)),
        raising=False,
    )
    monkeypatch.setattr(
        shopee_route,
        "simulate_orders_for_run",
        lambda _db, run_id, user_id, tick_time: {
            "tick_time": tick_time or datetime.utcnow(),
            "active_buyer_count": 0,
            "candidate_product_count": 0,
            "generated_order_count": 0,
            "skip_reasons": {},
            "buyer_journeys": [],
        },
    )

    simulate_resp = client.post(
        f"/shopee/runs/{run['id']}/orders/simulate",
        headers={"Authorization": f"Bearer {player_token}"},
    )
    assert simulate_resp.status_code == 200
    assert called, "orders cache should be invalidated after simulate succeeds"


def test_shopee_orders_list_returns_429_when_rate_limited(monkeypatch):
    from app.api.routes import shopee as shopee_route

    player_token = _register_or_login_player("13800138216")
    run = _create_running_run(player_token)
    monkeypatch.setattr(shopee_route, "check_rate_limit", lambda **_kwargs: (True, 0, 0), raising=False)

    resp = client.get(
        f"/shopee/runs/{run['id']}/orders",
        headers={"Authorization": f"Bearer {player_token}"},
        params={"type": "all"},
    )
    assert resp.status_code == 429


def test_shopee_simulate_returns_409_when_distributed_lock_is_busy(monkeypatch):
    from app.api.routes import shopee as shopee_route

    player_token = _register_or_login_player("13800138217")
    run = _create_running_run(player_token)
    monkeypatch.setattr(shopee_route, "acquire_distributed_lock", lambda *_args, **_kwargs: None, raising=False)

    resp = client.post(
        f"/shopee/runs/{run['id']}/orders/simulate",
        headers={"Authorization": f"Bearer {player_token}"},
    )
    assert resp.status_code == 409


def test_admin_simulate_returns_429_when_rate_limited(monkeypatch):
    from app.api.routes import game as game_route

    player_token = _register_or_login_player("13800138218")
    run = _create_running_run(player_token)
    admin_login = client.post("/auth/login", json={"username": "yzcube", "password": "yzcube123"})
    assert admin_login.status_code == 200
    admin_token = admin_login.json()["access_token"]

    monkeypatch.setattr(game_route, "check_rate_limit", lambda **_kwargs: (True, 0, 0), raising=False)
    resp = client.post(
        f"/game/admin/runs/{run['id']}/orders/simulate",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 429


def test_auto_order_tick_worker_skips_and_finishes_expired_run(monkeypatch):
    from app.db import SessionLocal
    from app.models import GameRun
    from app.services import auto_order_tick_worker as worker

    player_token = _register_or_login_player("13800138219")
    run = _create_running_run(player_token)

    with SessionLocal() as db:
        row = db.query(GameRun).filter(GameRun.id == run["id"]).first()
        assert row is not None
        row.created_at = datetime.utcnow() - timedelta(days=8)
        db.commit()

    called: list[int] = []
    monkeypatch.setattr(worker, "acquire_distributed_lock", lambda *_args, **_kwargs: "token", raising=False)
    monkeypatch.setattr(worker, "release_distributed_lock", lambda *_args, **_kwargs: None, raising=False)
    monkeypatch.setattr(
        worker,
        "simulate_orders_for_run",
        lambda *_args, **_kwargs: called.append(1),
        raising=False,
    )

    with SessionLocal() as db:
        run_cnt, tick_cnt = worker._run_one_cycle(db, datetime.utcnow())
        assert run_cnt == 0
        assert tick_cnt == 0

    with SessionLocal() as db:
        row = db.query(GameRun).filter(GameRun.id == run["id"]).first()
        assert row is not None
        assert row.status == "finished"
    assert called == []
