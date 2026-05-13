"""Backend sanity tests for new safety + profile horoscope/hide_age features."""
import os
import sys
import uuid
import json
import requests

BASE = "https://bump-venue-live.preview.emergentagent.com/api"

AVA_EMAIL = "ava@bump.app"
AVA_PASSWORD = "demo1234"
ADMIN_EMAIL = "admin@bump.app"
ADMIN_PASSWORD = "admin1234"

results = []  # (name, ok, msg)


def step(name, ok, msg=""):
    icon = "✅" if ok else "❌"
    print(f"{icon} {name}{(' — ' + msg) if msg else ''}")
    results.append((name, ok, msg))
    return ok


def login(email, password):
    r = requests.post(f"{BASE}/auth/login", json={"email": email, "password": password}, timeout=15)
    r.raise_for_status()
    return r.json()["token"], r.json()["user"]


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def main():
    # ---- Login Ava ----
    ava_token, ava = login(AVA_EMAIL, AVA_PASSWORD)
    AVA_ID = ava["id"]
    print(f"\nava id={AVA_ID}\n")

    # Pick a different "target user" from /admin/users via admin
    admin_token, _admin = login(ADMIN_EMAIL, ADMIN_PASSWORD)
    users = requests.get(f"{BASE}/admin/users", headers=auth(admin_token), timeout=15).json()
    target = next(u for u in users if u["id"] != AVA_ID and not u.get("is_admin") and u["email"].endswith("@bump.app"))
    TARGET_ID = target["id"]
    print(f"target user: {target.get('first_name')} id={TARGET_ID}")

    # Clean state: unblock target if previously blocked + reset reports
    requests.post(f"{BASE}/safety/unblock/{TARGET_ID}", headers=auth(ava_token), timeout=10)
    # Resolve any open reports targeting target (use admin/unsuspend)
    requests.post(f"{BASE}/admin/users/{TARGET_ID}/unsuspend", headers=auth(admin_token), timeout=10)

    # =========================================================
    # Test 1: Safety report-categories + POST /safety/report
    # =========================================================
    r = requests.get(f"{BASE}/safety/report-categories", timeout=10)
    expected = {"spam", "harassment", "inappropriate_photo", "fake_profile", "underage", "violence", "other"}
    cats = {c["code"] for c in r.json()}
    step("GET /safety/report-categories returns 7 categories with code+label",
         r.status_code == 200 and cats == expected and all("code" in c and "label" in c for c in r.json()),
         f"status={r.status_code} cats={cats}")

    # POST /safety/report valid
    r = requests.post(f"{BASE}/safety/report", headers=auth(ava_token),
                      json={"target_user_id": TARGET_ID, "reason": "spam"}, timeout=10)
    body = r.json()
    step("POST /safety/report valid → 200 ok+report_id",
         r.status_code == 200 and body.get("ok") and body.get("report_id") and not body.get("duplicate"),
         f"status={r.status_code} body={body}")

    # Duplicate
    r2 = requests.post(f"{BASE}/safety/report", headers=auth(ava_token),
                       json={"target_user_id": TARGET_ID, "reason": "spam"}, timeout=10)
    body2 = r2.json()
    step("POST /safety/report duplicate → 200 duplicate:true",
         r2.status_code == 200 and body2.get("duplicate") is True and body2.get("report_id") == body.get("report_id"),
         f"status={r2.status_code} body={body2}")

    # Invalid reason
    r = requests.post(f"{BASE}/safety/report", headers=auth(ava_token),
                      json={"target_user_id": TARGET_ID, "reason": "xyz"}, timeout=10)
    step("POST /safety/report invalid reason → 400", r.status_code == 400, f"status={r.status_code} body={r.text[:120]}")

    # Self report
    r = requests.post(f"{BASE}/safety/report", headers=auth(ava_token),
                      json={"target_user_id": AVA_ID, "reason": "spam"}, timeout=10)
    step("POST /safety/report self → 400", r.status_code == 400, f"status={r.status_code}")

    # Nonexistent target
    fake_id = str(uuid.uuid4())
    r = requests.post(f"{BASE}/safety/report", headers=auth(ava_token),
                      json={"target_user_id": fake_id, "reason": "spam"}, timeout=10)
    step("POST /safety/report nonexistent target → 404", r.status_code == 404, f"status={r.status_code}")

    # =========================================================
    # Test 2: Auto-block after report
    # =========================================================
    me = requests.get(f"{BASE}/auth/me", headers=auth(ava_token), timeout=10).json()
    step("GET /auth/me shows target in blocked_users after report",
         TARGET_ID in (me.get("blocked_users") or []),
         f"blocked_users={me.get('blocked_users')}")

    # =========================================================
    # Test 3: Blocked list endpoint
    # =========================================================
    r = requests.get(f"{BASE}/safety/blocked", headers=auth(ava_token), timeout=10)
    blocked = r.json()
    has_target_entry = any(u["id"] == TARGET_ID for u in blocked)
    sample = next((u for u in blocked if u["id"] == TARGET_ID), {})
    expected_keys = {"id", "first_name", "photos", "age"}
    step("GET /safety/blocked returns blocked users with profile summary",
         r.status_code == 200 and has_target_entry and expected_keys.issubset(set(sample.keys())),
         f"status={r.status_code} sample_keys={list(sample.keys())}")

    # Unblock
    r = requests.post(f"{BASE}/safety/unblock/{TARGET_ID}", headers=auth(ava_token), timeout=10)
    step("POST /safety/unblock/{id} → 200", r.status_code == 200 and r.json().get("ok"),
         f"status={r.status_code}")

    r = requests.get(f"{BASE}/safety/blocked", headers=auth(ava_token), timeout=10)
    blocked2 = r.json()
    step("GET /safety/blocked no longer contains target after unblock",
         not any(u["id"] == TARGET_ID for u in blocked2),
         f"blocked={[u['id'] for u in blocked2]}")

    # =========================================================
    # Test 4: Auto-hide after threshold
    # =========================================================
    # Resolve previous report so it doesn't count + reset ava
    requests.post(f"{BASE}/admin/users/{AVA_ID}/unsuspend", headers=auth(admin_token), timeout=10)

    # Create 3 fresh users via /auth/register, have each report ava
    blocker_tokens = []
    blocker_ids = []
    for i in range(1, 4):
        email = f"e2e_blocker_{i}_{uuid.uuid4().hex[:6]}@bump.dev"
        r = requests.post(f"{BASE}/auth/register",
                          json={"email": email, "password": "test1234",
                                "first_name": f"Blocker{i}", "age": 25}, timeout=15)
        if r.status_code != 200:
            step(f"Register blocker {i}", False, f"status={r.status_code} body={r.text[:120]}")
            return
        bt = r.json()["token"]
        bid = r.json()["user"]["id"]
        blocker_tokens.append(bt)
        blocker_ids.append(bid)
    step("Registered 3 e2e blocker users", True, f"ids={blocker_ids}")

    # Each reports ava
    for i, bt in enumerate(blocker_tokens, 1):
        r = requests.post(f"{BASE}/safety/report", headers=auth(bt),
                          json={"target_user_id": AVA_ID, "reason": "spam"}, timeout=10)
        step(f"blocker_{i} POST /safety/report against ava → 200",
             r.status_code == 200 and r.json().get("ok"), f"status={r.status_code}")

    # Check ava's is_hidden via /admin/users (no public /profile/{id} exists)
    users_after = requests.get(f"{BASE}/admin/users", headers=auth(admin_token), timeout=15).json()
    ava_after = next(u for u in users_after if u["id"] == AVA_ID)
    step("Ava is_hidden=true after 3 reports (auto-hide)",
         ava_after.get("is_hidden") is True,
         f"is_hidden={ava_after.get('is_hidden')}")
    step("Ava auto_hidden_at is set",
         bool(ava_after.get("auto_hidden_at")),
         f"auto_hidden_at={ava_after.get('auto_hidden_at')}")

    # Cleanup: unsuspend ava (also resolves the open reports)
    r = requests.post(f"{BASE}/admin/users/{AVA_ID}/unsuspend", headers=auth(admin_token), timeout=10)
    step("Admin unsuspend ava cleanup", r.status_code == 200, f"status={r.status_code}")

    # Cleanup: delete blocker users
    for bid in blocker_ids:
        requests.delete(f"{BASE}/admin/users/{bid}", headers=auth(admin_token), timeout=10)

    # Re-fetch ava: should be is_hidden=False now and the blocked_users we added (3 blockers) should have triggered ava blocks on blockers via auto-block (in reverse direction) — actually only the reporter is auto-blocked. So ava's blocked_users should NOT have changed.

    # =========================================================
    # Test 5: Profile horoscope + hide_age
    # =========================================================
    # Re-login ava because state could have changed
    ava_token, _ = login(AVA_EMAIL, AVA_PASSWORD)

    r = requests.get(f"{BASE}/profile/horoscopes", timeout=10)
    signs = r.json()
    ok_signs = (r.status_code == 200 and isinstance(signs, list) and len(signs) == 12
                and all("sign" in s and "emoji" in s for s in signs))
    step("GET /profile/horoscopes returns 12 signs with emoji", ok_signs,
         f"count={len(signs) if isinstance(signs, list) else 'n/a'}")

    # PUT horoscope=Leo + hide_age=true
    r = requests.put(f"{BASE}/profile", headers=auth(ava_token),
                     json={"horoscope": "Leo", "hide_age": True}, timeout=10)
    updated = r.json()
    step("PUT /profile horoscope=Leo + hide_age=true",
         r.status_code == 200 and updated.get("horoscope") == "Leo" and updated.get("hide_age") is True,
         f"horoscope={updated.get('horoscope')} hide_age={updated.get('hide_age')}")

    # PUT birthday → auto-derive horoscope=Leo
    r = requests.put(f"{BASE}/profile", headers=auth(ava_token),
                     json={"birthday": "1990-08-15"}, timeout=10)
    updated = r.json()
    step("PUT /profile birthday=1990-08-15 auto-derives horoscope=Leo",
         r.status_code == 200 and updated.get("horoscope") == "Leo",
         f"horoscope={updated.get('horoscope')}")

    # Invalid horoscope → 400
    r = requests.put(f"{BASE}/profile", headers=auth(ava_token),
                     json={"horoscope": "Notazodiac"}, timeout=10)
    step("PUT /profile invalid horoscope → 400", r.status_code == 400, f"status={r.status_code} body={r.text[:120]}")

    # Revert hide_age=false
    r = requests.put(f"{BASE}/profile", headers=auth(ava_token),
                     json={"hide_age": False}, timeout=10)
    updated = r.json()
    step("PUT /profile hide_age=false reverts",
         r.status_code == 200 and updated.get("hide_age") is False,
         f"hide_age={updated.get('hide_age')}")

    # =========================================================
    # Test 6: Admin suspend/unsuspend
    # =========================================================
    # Use Maya as target to avoid corrupting ava state for downstream tests
    maya = next(u for u in users if u["email"] == "maya@bump.app")
    MAYA_ID = maya["id"]

    r = requests.post(f"{BASE}/admin/users/{MAYA_ID}/suspend", headers=auth(admin_token), timeout=10)
    step("POST /admin/users/{id}/suspend → 200", r.status_code == 200, f"status={r.status_code}")

    users_now = requests.get(f"{BASE}/admin/users", headers=auth(admin_token), timeout=15).json()
    maya_now = next(u for u in users_now if u["id"] == MAYA_ID)
    step("Suspended user has is_hidden=true AND is_suspended=true",
         maya_now.get("is_hidden") is True and maya_now.get("is_suspended") is True,
         f"is_hidden={maya_now.get('is_hidden')} is_suspended={maya_now.get('is_suspended')}")

    r = requests.post(f"{BASE}/admin/users/{MAYA_ID}/unsuspend", headers=auth(admin_token), timeout=10)
    step("POST /admin/users/{id}/unsuspend → 200", r.status_code == 200, f"status={r.status_code}")

    users_now = requests.get(f"{BASE}/admin/users", headers=auth(admin_token), timeout=15).json()
    maya_now = next(u for u in users_now if u["id"] == MAYA_ID)
    step("Unsuspended user has is_hidden=false AND is_suspended=false",
         maya_now.get("is_hidden") is False and maya_now.get("is_suspended") is False,
         f"is_hidden={maya_now.get('is_hidden')} is_suspended={maya_now.get('is_suspended')}")

    # =========================================================
    # Test 7: Sanity
    # =========================================================
    r = requests.post(f"{BASE}/auth/login", json={"email": AVA_EMAIL, "password": AVA_PASSWORD}, timeout=10)
    step("POST /auth/login ava → 200", r.status_code == 200 and r.json().get("token"))

    tok = r.json()["token"]
    r = requests.get(f"{BASE}/auth/me", headers=auth(tok), timeout=10)
    step("GET /auth/me → returns user", r.status_code == 200 and r.json().get("id") == AVA_ID)

    r = requests.get(f"{BASE}/venues?lat=40.758&lng=-73.9855", headers=auth(tok), timeout=20)
    venues = r.json()
    # First Nightclub/Lounge should come before first Restaurant
    first_nl = next((i for i, v in enumerate(venues) if v.get("kind") in ("Nightclub", "Lounge")), None)
    first_rest = next((i for i, v in enumerate(venues) if v.get("kind") == "Restaurant"), None)
    ok_order = r.status_code == 200 and isinstance(venues, list) and len(venues) > 0
    if ok_order and first_nl is not None and first_rest is not None:
        ok_order = first_nl < first_rest
    step("GET /venues returns sorted list with Nightclub/Lounge first",
         ok_order, f"count={len(venues) if isinstance(venues, list) else 'n/a'} first_nl_idx={first_nl} first_rest_idx={first_rest}")

    # Summary
    print("\n" + "=" * 60)
    passed = sum(1 for _, ok, _ in results if ok)
    print(f"PASSED: {passed}/{len(results)}")
    for n, ok, m in results:
        if not ok:
            print(f"  ❌ {n} — {m}")
    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    sys.exit(main())
