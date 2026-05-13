"""Shared pytest fixtures for BUMP backend tests."""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_BACKEND_URL") or os.environ.get("EXPO_PUBLIC_BACKEND_URL") or "https://bump-venue-live.preview.emergentagent.com"
BASE_URL = BASE_URL.rstrip("/")


@pytest.fixture(scope="session")
def base_url():
    return BASE_URL


@pytest.fixture(scope="session")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _login(api_client, email, password):
    r = api_client.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, f"Login failed for {email}: {r.status_code} {r.text}"
    return r.json()


@pytest.fixture(scope="session")
def ava_auth(api_client):
    return _login(api_client, "ava@bump.app", "demo1234")


@pytest.fixture(scope="session")
def admin_auth(api_client):
    return _login(api_client, "admin@bump.app", "admin1234")


@pytest.fixture(scope="session")
def leo_auth(api_client):
    return _login(api_client, "leo@bump.app", "demo1234")


def auth_header(token):
    return {"Authorization": f"Bearer {token}"}
