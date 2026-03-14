import os
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


def _create_running_run(token: str, initial_cash: int = 200000) -> dict:
    response = client.post(
        "/game/runs",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "initial_cash": initial_cash,
            "market": "MY",
            "duration_days": 365,
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
    assert body["total_cash"] == 200000
    assert body["spent_total"] == 0
    assert body["remaining_cash"] == 200000


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
    assert body["remaining_cash"] == 200000 - body["total_amount"]

    summary_resp = client.get(
        f"/game/runs/{run['id']}/procurement/cart-summary",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert summary_resp.status_code == 200
    summary = summary_resp.json()
    assert summary["spent_total"] == body["total_amount"]
    assert summary["remaining_cash"] == 200000 - body["total_amount"]

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
