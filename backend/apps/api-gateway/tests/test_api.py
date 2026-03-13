import os
from pathlib import Path

from fastapi.testclient import TestClient

DB_FILE = Path(__file__).with_name("test_auth.db")
if DB_FILE.exists():
    DB_FILE.unlink()

os.environ["DATABASE_URL"] = f"sqlite:///{DB_FILE}"
os.environ["SUPER_ADMIN_INIT_PASSWORD"] = "yzcube123"

from app.main import app


client = TestClient(app)


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
