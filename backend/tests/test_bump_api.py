"""BUMP backend API tests - comprehensive coverage."""
import uuid
import time
import pytest
import requests
import websocket
import json
import threading
from conftest import BASE_URL, auth_header


# ---------- Health ----------
class TestHealth:
    def test_root(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/")
        assert r.status_code == 200
        data = r.json()
        assert data["app"] == "BUMP"
        assert "tagline" in data


# ---------- Auth ----------
class TestAuth:
    def test_login_ava(self, ava_auth):
        assert "token" in ava_auth
        assert ava_auth["user"]["email"] == "ava@bump.app"
        assert "password" not in ava_auth["user"]

    def test_login_admin(self, admin_auth):
        assert admin_auth["user"]["is_admin"] is True

    def test_login_invalid(self, api_client):
        r = api_client.post(f"{BASE_URL}/api/auth/login", json={"email": "ava@bump.app", "password": "wrong"})
        assert r.status_code == 401

    def test_register_and_duplicate(self, api_client):
        email = f"test_{uuid.uuid4().hex[:8]}@bump.app"
        r = api_client.post(f"{BASE_URL}/api/auth/register", json={
            "email": email, "password": "test1234", "first_name": "TEST_User", "age": 25
        })
        assert r.status_code == 200, r.text
        data = r.json()
        assert "token" in data
        assert data["user"]["email"] == email
        # duplicate
        r2 = api_client.post(f"{BASE_URL}/api/auth/register", json={
            "email": email, "password": "test1234", "first_name": "TEST_User", "age": 25
        })
        assert r2.status_code == 400

    def test_me_requires_auth(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code in (401, 403)

    def test_me_with_token(self, api_client, ava_auth):
        r = api_client.get(f"{BASE_URL}/api/auth/me", headers=auth_header(ava_auth["token"]))
        assert r.status_code == 200
        assert r.json()["email"] == "ava@bump.app"


# ---------- Profile ----------
class TestProfile:
    def test_update_profile(self, api_client, ava_auth):
        r = api_client.put(
            f"{BASE_URL}/api/profile",
            headers=auth_header(ava_auth["token"]),
            json={"bio": "TEST_updated bio", "interests": ["TEST_yoga", "house"]},
        )
        assert r.status_code == 200
        # verify persistence via me
        r2 = api_client.get(f"{BASE_URL}/api/auth/me", headers=auth_header(ava_auth["token"]))
        assert r2.json()["bio"] == "TEST_updated bio"
        assert "TEST_yoga" in r2.json()["interests"]


# ---------- Venues ----------
class TestVenues:
    def test_list_venues(self, api_client, ava_auth):
        r = api_client.get(f"{BASE_URL}/api/venues", headers=auth_header(ava_auth["token"]))
        assert r.status_code == 200
        v = r.json()
        assert len(v) >= 8
        for venue in v:
            assert "id" in venue
            assert "name" in venue
            assert "active_count" in venue
            assert isinstance(venue["active_count"], int)

    def test_get_venue_detail(self, api_client, ava_auth):
        venues = api_client.get(f"{BASE_URL}/api/venues", headers=auth_header(ava_auth["token"])).json()
        vid = venues[0]["id"]
        r = api_client.get(f"{BASE_URL}/api/venues/{vid}", headers=auth_header(ava_auth["token"]))
        assert r.status_code == 200
        assert r.json()["id"] == vid

    def test_venue_not_found(self, api_client, ava_auth):
        r = api_client.get(f"{BASE_URL}/api/venues/nonexistent", headers=auth_header(ava_auth["token"]))
        assert r.status_code == 404


# ---------- Check-in ----------
class TestCheckin:
    def test_active_checkin_ava(self, api_client, ava_auth):
        r = api_client.get(f"{BASE_URL}/api/checkin/active", headers=auth_header(ava_auth["token"]))
        assert r.status_code == 200
        data = r.json()
        assert data["active"] is True
        assert "venue_id" in data["checkin"]

    def test_checkin_demo_mode(self, api_client):
        # Register fresh user and check-in
        email = f"chkin_{uuid.uuid4().hex[:8]}@bump.app"
        reg = api_client.post(f"{BASE_URL}/api/auth/register", json={
            "email": email, "password": "test1234", "first_name": "TEST_Chk", "age": 25
        }).json()
        token = reg["token"]
        venues = api_client.get(f"{BASE_URL}/api/venues", headers=auth_header(token)).json()
        vid = venues[0]["id"]
        # Far away coords - DEMO_MODE=1 should allow
        r = api_client.post(f"{BASE_URL}/api/checkin", headers=auth_header(token), json={
            "venue_id": vid, "lat": 0.0, "lng": 0.0, "selfie_base64": "data:image/png;base64,iVBORw0KGgo="
        })
        assert r.status_code == 200, r.text
        assert r.json()["venue_id"] == vid
        # verify active
        r2 = api_client.get(f"{BASE_URL}/api/checkin/active", headers=auth_header(token))
        assert r2.json()["active"] is True

    def test_venue_feed_excludes_self(self, api_client, ava_auth):
        active = api_client.get(f"{BASE_URL}/api/checkin/active", headers=auth_header(ava_auth["token"])).json()
        vid = active["checkin"]["venue_id"]
        r = api_client.get(f"{BASE_URL}/api/venues/{vid}/feed", headers=auth_header(ava_auth["token"]))
        assert r.status_code == 200
        for entry in r.json():
            assert entry["user"]["id"] != ava_auth["user"]["id"]


# ---------- Likes & Matches ----------
class TestMatches:
    def test_mutual_match_creates(self, api_client):
        # Register two test users
        e1 = f"m1_{uuid.uuid4().hex[:8]}@bump.app"
        e2 = f"m2_{uuid.uuid4().hex[:8]}@bump.app"
        u1 = api_client.post(f"{BASE_URL}/api/auth/register", json={"email": e1, "password": "x12345", "first_name": "TEST_U1", "age": 25}).json()
        u2 = api_client.post(f"{BASE_URL}/api/auth/register", json={"email": e2, "password": "x12345", "first_name": "TEST_U2", "age": 26}).json()

        # u1 likes u2
        r1 = api_client.post(f"{BASE_URL}/api/likes", headers=auth_header(u1["token"]),
                             json={"target_user_id": u2["user"]["id"], "action": "like"})
        assert r1.status_code == 200
        assert r1.json()["matched"] is False

        # u2 likes u1 -> match
        r2 = api_client.post(f"{BASE_URL}/api/likes", headers=auth_header(u2["token"]),
                             json={"target_user_id": u1["user"]["id"], "action": "like"})
        assert r2.status_code == 200
        body = r2.json()
        assert body["matched"] is True
        match_id = body["match_id"]

        # both should see this match
        ml = api_client.get(f"{BASE_URL}/api/matches", headers=auth_header(u1["token"])).json()
        assert any(m["match_id"] == match_id for m in ml)

        # send/recv message
        sm = api_client.post(f"{BASE_URL}/api/messages", headers=auth_header(u1["token"]),
                             json={"match_id": match_id, "text": "TEST_hello"})
        assert sm.status_code == 200

        msgs = api_client.get(f"{BASE_URL}/api/messages/{match_id}", headers=auth_header(u2["token"])).json()
        assert any(m["text"] == "TEST_hello" for m in msgs)

        # keep match
        k = api_client.post(f"{BASE_URL}/api/matches/keep", headers=auth_header(u1["token"]),
                            json={"match_id": match_id})
        assert k.status_code == 200

    def test_pass_no_match(self, api_client, ava_auth, leo_auth):
        r = api_client.post(f"{BASE_URL}/api/likes", headers=auth_header(ava_auth["token"]),
                            json={"target_user_id": leo_auth["user"]["id"], "action": "pass"})
        assert r.status_code == 200
        assert r.json()["matched"] is False

    def test_self_like_rejected(self, api_client, ava_auth):
        r = api_client.post(f"{BASE_URL}/api/likes", headers=auth_header(ava_auth["token"]),
                            json={"target_user_id": ava_auth["user"]["id"], "action": "like"})
        assert r.status_code == 400


# ---------- Safety ----------
class TestSafety:
    def test_block_report_hide(self, api_client):
        e = f"safe_{uuid.uuid4().hex[:8]}@bump.app"
        u = api_client.post(f"{BASE_URL}/api/auth/register", json={"email": e, "password": "x12345", "first_name": "TEST_S", "age": 22}).json()
        token = u["token"]
        target_id = "fake-target-uuid"
        r1 = api_client.post(f"{BASE_URL}/api/safety/block/{target_id}", headers=auth_header(token))
        assert r1.status_code == 200
        r2 = api_client.post(f"{BASE_URL}/api/safety/report", headers=auth_header(token), json={"target_user_id": target_id, "reason": "TEST_spam"})
        assert r2.status_code == 200
        r3 = api_client.post(f"{BASE_URL}/api/safety/hide?hidden=true", headers=auth_header(token))
        assert r3.status_code == 200
        assert r3.json()["hidden"] is True

    def test_delete_account(self, api_client):
        e = f"del_{uuid.uuid4().hex[:8]}@bump.app"
        u = api_client.post(f"{BASE_URL}/api/auth/register", json={"email": e, "password": "x12345", "first_name": "TEST_D", "age": 22}).json()
        token = u["token"]
        r = api_client.delete(f"{BASE_URL}/api/account", headers=auth_header(token))
        assert r.status_code == 200
        # token should now fail
        r2 = api_client.get(f"{BASE_URL}/api/auth/me", headers=auth_header(token))
        assert r2.status_code == 401


# ---------- Admin ----------
class TestAdmin:
    def test_admin_analytics(self, api_client, admin_auth):
        r = api_client.get(f"{BASE_URL}/api/admin/analytics", headers=auth_header(admin_auth["token"]))
        assert r.status_code == 200
        d = r.json()
        for k in ("total_users", "total_venues", "active_checkins", "total_matches", "total_messages", "open_reports"):
            assert k in d

    def test_admin_users_list(self, api_client, admin_auth):
        r = api_client.get(f"{BASE_URL}/api/admin/users", headers=auth_header(admin_auth["token"]))
        assert r.status_code == 200
        assert len(r.json()) >= 7

    def test_admin_reports(self, api_client, admin_auth):
        r = api_client.get(f"{BASE_URL}/api/admin/reports", headers=auth_header(admin_auth["token"]))
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_admin_requires_admin_role(self, api_client, ava_auth):
        r = api_client.get(f"{BASE_URL}/api/admin/analytics", headers=auth_header(ava_auth["token"]))
        assert r.status_code == 403


# ---------- WebSocket ----------
class TestWebSocket:
    def test_ws_connect(self):
        ws_url = BASE_URL.replace("https://", "wss://").replace("http://", "ws://") + "/api/ws/chat/test-match-id"
        try:
            ws = websocket.create_connection(ws_url, timeout=10)
            assert ws.connected
            ws.close()
        except Exception as e:
            pytest.fail(f"WS connection failed: {e}")
