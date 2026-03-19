import os
from datetime import datetime
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
            "category": "手机数码",
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
        data={"status_value": "live"},
    )
    assert publish_live.status_code == 201
    publish_body = publish_live.json()
    assert publish_body["status"] == "live"
    assert publish_body["listing_id"] > 0

    products = client.get(
        f"/shopee/runs/{run['id']}/products",
        headers={"Authorization": f"Bearer {token}"},
        params={"type": "live"},
    )
    assert products.status_code == 200
    rows = products.json()["listings"]
    assert any(row["id"] == publish_body["listing_id"] for row in rows)


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


def test_admin_simulate_orders_generates_orders_and_visible_to_player(monkeypatch):
    player_token = _register_or_login_player("13800138211")
    run = _create_running_run(player_token)
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
    run = _create_running_run(player_token)

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
    run = _create_running_run(player_token)
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
