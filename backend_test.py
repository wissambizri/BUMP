"""BUMP backend test for push notification endpoints + sanity check."""
import os
import sys
import requests
from pymongo import MongoClient

BACKEND_URL = "https://bump-venue-live.preview.emergentagent.com/api"
EMAIL = "ava@bump.app"
PASSWORD = "demo1234"

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

results = []


def record(name, ok, detail=""):
    status = "PASS" if ok else "FAIL"
    print(f"[{status}] {name}{(' — ' + detail) if detail else ''}")
    results.append((name, ok, detail))


def main():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})

    # === Sanity: login ===
    r = s.post(f"{BACKEND_URL}/auth/login", json={"email": EMAIL, "password": PASSWORD})
    record("POST /auth/login (ava@bump.app/demo1234)", r.status_code == 200, f"HTTP {r.status_code}")
    if r.status_code != 200:
        print("Cannot continue without auth token")
        sys.exit(1)
    data = r.json()
    token = data["token"]
    user_id = data["user"]["id"]
    auth_headers = {"Authorization": f"Bearer {token}"}

    # === Sanity: /auth/me ===
    r = s.get(f"{BACKEND_URL}/auth/me", headers=auth_headers)
    record("GET /auth/me (with token)", r.status_code == 200 and r.json().get("id") == user_id,
           f"HTTP {r.status_code}")

    # === Sanity: /auth/identify ===
    r = s.post(f"{BACKEND_URL}/auth/identify", json={"identifier": EMAIL})
    record("POST /auth/identify (ava@bump.app)",
           r.status_code == 200 and r.json().get("kind") == "email" and r.json().get("exists") is True,
           f"HTTP {r.status_code}, body={r.text[:100]}")

    # === Sanity: /venues ===
    r = s.get(f"{BACKEND_URL}/venues?lat=40.758&lng=-73.9855", headers=auth_headers)
    venues_ok = r.status_code == 200 and isinstance(r.json(), list)
    record("GET /venues?lat=40.758&lng=-73.9855", venues_ok,
           f"HTTP {r.status_code}, count={len(r.json()) if venues_ok else 'n/a'}")

    print("\n=== PUSH REGISTER TESTS ===\n")

    # --- Scenario 1: Auth required ---
    r = s.post(f"{BACKEND_URL}/push/register",
               json={"token": "ExponentPushToken[abc]", "platform": "ios"})
    record("POST /push/register — no Authorization header → 401",
           r.status_code == 401, f"HTTP {r.status_code}, body={r.text[:120]}")

    r = s.post(f"{BACKEND_URL}/push/register",
               json={"token": "ExponentPushToken[abc]", "platform": "ios"},
               headers={"Authorization": "Bearer notreal"})
    record("POST /push/register — invalid Bearer token → 401",
           r.status_code == 401, f"HTTP {r.status_code}, body={r.text[:120]}")

    # --- Scenario 2: Invalid token format ---
    r = s.post(f"{BACKEND_URL}/push/register", json={"token": "not-an-expo-token"},
               headers=auth_headers)
    record("POST /push/register — token='not-an-expo-token' → 400",
           r.status_code == 400, f"HTTP {r.status_code}, body={r.text[:120]}")

    r = s.post(f"{BACKEND_URL}/push/register", json={"token": ""}, headers=auth_headers)
    record("POST /push/register — token='' → 400",
           r.status_code == 400, f"HTTP {r.status_code}, body={r.text[:120]}")

    r = s.post(f"{BACKEND_URL}/push/register", json={"token": "ExpoPushToken[xxx]"},
               headers=auth_headers)
    record("POST /push/register — token='ExpoPushToken[xxx]' (wrong prefix) → 400",
           r.status_code == 400, f"HTTP {r.status_code}, body={r.text[:120]}")

    # --- Scenario 3: Happy path ---
    tok1 = "ExponentPushToken[abc123xyz]"
    r = s.post(f"{BACKEND_URL}/push/register",
               json={"token": tok1, "platform": "ios", "device_name": "iPhone Test"},
               headers=auth_headers)
    happy_ok = r.status_code == 200 and r.json().get("registered") is True
    record("POST /push/register — happy path → 200 {registered:true}",
           happy_ok, f"HTTP {r.status_code}, body={r.text[:120]}")

    # Verify in MongoDB
    try:
        mongo = MongoClient(MONGO_URL)
        col = mongo[DB_NAME].push_tokens
        doc = col.find_one({"token": tok1})
        db_ok = (
            doc is not None
            and doc.get("user_id") == user_id
            and doc.get("platform") == "ios"
            and doc.get("device_name") == "iPhone Test"
            and doc.get("created_at") is not None
            and doc.get("updated_at") is not None
        )
        record("DB: push_tokens has doc with token/user_id/platform/device_name/created_at/updated_at",
               db_ok, f"doc={ {k: doc.get(k) for k in ('user_id','platform','device_name')} if doc else None}")
    except Exception as e:
        record("DB: connect & inspect push_tokens", False, str(e))

    # Re-register same token (upsert, no duplicate)
    r = s.post(f"{BACKEND_URL}/push/register",
               json={"token": tok1, "platform": "ios", "device_name": "iPhone Test Renamed"},
               headers=auth_headers)
    rereg_ok = r.status_code == 200 and r.json().get("registered") is True
    record("POST /push/register — same token again → 200 (upsert)",
           rereg_ok, f"HTTP {r.status_code}")
    try:
        count = mongo[DB_NAME].push_tokens.count_documents({"token": tok1})
        record("DB: no duplicate after re-register (count=1)",
               count == 1, f"count={count}")
        doc2 = mongo[DB_NAME].push_tokens.find_one({"token": tok1})
        record("DB: device_name updated by upsert",
               doc2.get("device_name") == "iPhone Test Renamed",
               f"device_name={doc2.get('device_name')}")
    except Exception as e:
        record("DB: count after re-register", False, str(e))

    # Second token, same user
    tok2 = "ExponentPushToken[second_device_999]"
    r = s.post(f"{BACKEND_URL}/push/register",
               json={"token": tok2, "platform": "android", "device_name": "Pixel"},
               headers=auth_headers)
    sec_ok = r.status_code == 200 and r.json().get("registered") is True
    record("POST /push/register — second token same user → 200",
           sec_ok, f"HTTP {r.status_code}")
    try:
        user_tokens = list(mongo[DB_NAME].push_tokens.find({"user_id": user_id}))
        record("DB: user has 2 distinct tokens (multi-device)",
               len([t for t in user_tokens if t["token"] in (tok1, tok2)]) == 2,
               f"user_token_count={len(user_tokens)}")
    except Exception as e:
        record("DB: list user push_tokens", False, str(e))

    print("\n=== PUSH UNREGISTER (DELETE) TESTS ===\n")

    # No auth → 401
    r = s.delete(f"{BACKEND_URL}/push/register?token={tok1}")
    record("DELETE /push/register — no auth → 401",
           r.status_code == 401, f"HTTP {r.status_code}")

    # With auth + existing token → 200 + removed
    r = s.delete(f"{BACKEND_URL}/push/register?token={tok1}", headers=auth_headers)
    del_ok = r.status_code == 200 and r.json().get("ok") is True
    record("DELETE /push/register — existing token → 200 {ok:true}",
           del_ok, f"HTTP {r.status_code}, body={r.text[:120]}")
    try:
        doc = mongo[DB_NAME].push_tokens.find_one({"token": tok1})
        record("DB: doc removed for tok1", doc is None, f"doc={doc}")
    except Exception as e:
        record("DB: check removal of tok1", False, str(e))

    # Idempotent: deleting non-existent token → 200
    r = s.delete(f"{BACKEND_URL}/push/register?token=ExponentPushToken[doesnotexist]",
                 headers=auth_headers)
    idemp_ok = r.status_code == 200 and r.json().get("ok") is True
    record("DELETE /push/register — non-existent token → 200 (idempotent)",
           idemp_ok, f"HTTP {r.status_code}, body={r.text[:120]}")

    # Try deleting token that belongs to another user (we don't have one, but spec says
    # the route is idempotent — it filters by user_id, so even a token that exists for
    # someone else returns 200 ok and does NOT remove the other user's doc.
    # We simulate: insert a token for a fake user, try to delete with ava's token.
    fake_token = "ExponentPushToken[other_user_token_xyz]"
    try:
        mongo[DB_NAME].push_tokens.insert_one({
            "token": fake_token,
            "user_id": "other-user-id-not-ava",
            "platform": "ios",
            "created_at": None,
            "updated_at": None,
        })
        r = s.delete(f"{BACKEND_URL}/push/register?token={fake_token}", headers=auth_headers)
        other_ok = r.status_code == 200 and r.json().get("ok") is True
        record("DELETE /push/register — token belongs to other user → 200 (no info leak)",
               other_ok, f"HTTP {r.status_code}")
        # Verify other user's doc still exists
        still = mongo[DB_NAME].push_tokens.find_one({"token": fake_token})
        record("DB: other user's token NOT deleted by ava",
               still is not None and still.get("user_id") == "other-user-id-not-ava",
               f"still_exists={still is not None}")
        # Cleanup
        mongo[DB_NAME].push_tokens.delete_one({"token": fake_token})
    except Exception as e:
        record("DELETE other-user-token scenario", False, str(e))

    # Cleanup tok2
    try:
        mongo[DB_NAME].push_tokens.delete_many({"token": {"$in": [tok1, tok2, fake_token]}})
    except Exception:
        pass

    print("\n=== SUMMARY ===")
    fails = [r for r in results if not r[1]]
    print(f"Passed: {len(results) - len(fails)}/{len(results)}")
    if fails:
        print("\nFailed cases:")
        for n, _, d in fails:
            print(f"  - {n}: {d}")
        sys.exit(1)


if __name__ == "__main__":
    main()
