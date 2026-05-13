"""
Backend tests for Account Verification endpoints:
- POST /api/account/email/send
- POST /api/account/email/confirm
- POST /api/account/phone/send
- POST /api/account/phone/confirm

Uses ava@bump.app / demo1234 (and maya@bump.app for already-used scenarios).
"""
import os
import sys
import time
import uuid
import requests

BASE = os.environ.get("BACKEND_URL", "https://bump-venue-live.preview.emergentagent.com") + "/api"

PASSES = []
FAILS = []


def chk(name, cond, detail=""):
    if cond:
        PASSES.append(name)
        print(f"  ✅ {name}")
    else:
        FAILS.append((name, detail))
        print(f"  ❌ {name}  — {detail}")


def login(email, password):
    r = requests.post(f"{BASE}/auth/login", json={"email": email, "password": password}, timeout=20)
    r.raise_for_status()
    j = r.json()
    return j["token"], j["user"]


def main():
    print(f"BASE = {BASE}")

    # --- Login ava + maya
    ava_tok, ava_user = login("ava@bump.app", "demo1234")
    maya_tok, maya_user = login("maya@bump.app", "demo1234")
    print(f"ava.id={ava_user['id']}  ava.email={ava_user.get('email')}  email_verified={ava_user.get('email_verified')}")
    print(f"maya.id={maya_user['id']}  maya.email={maya_user.get('email')}")

    H_ava = {"Authorization": f"Bearer {ava_tok}"}
    H_maya = {"Authorization": f"Bearer {maya_tok}"}

    # ========================================================
    # 1. POST /api/account/email/send
    # ========================================================
    print("\n=== POST /api/account/email/send ===")

    # 1a. No auth → 401
    r = requests.post(f"{BASE}/account/email/send", json={"email": "x@y.com"}, timeout=20)
    chk("email/send: no auth → 401", r.status_code == 401, f"got {r.status_code} {r.text[:200]}")

    # 1b. With body new email → 200, sent:true, dev_code present (DEMO_MODE)
    fresh_email = f"verify_{uuid.uuid4().hex[:10]}@bump.app"
    r = requests.post(f"{BASE}/account/email/send", json={"email": fresh_email}, headers=H_ava, timeout=20)
    chk("email/send: fresh email → 200", r.status_code == 200, f"got {r.status_code} {r.text[:200]}")
    j = r.json() if r.status_code == 200 else {}
    chk("email/send: response sent=true", j.get("sent") is True, f"resp={j}")
    dev_code = j.get("dev_code")
    chk("email/send: dev_code present (DEMO_MODE)", bool(dev_code), f"resp={j}")

    # 1c. 2nd call within 30s → 429
    r = requests.post(f"{BASE}/account/email/send", json={"email": fresh_email}, headers=H_ava, timeout=20)
    chk("email/send: rate-limit 429 within 30s", r.status_code == 429,
        f"got {r.status_code} {r.text[:200]}")

    # 1d. Email already owned by another user (maya@bump.app) → 400
    r = requests.post(f"{BASE}/account/email/send", json={"email": "maya@bump.app"}, headers=H_ava, timeout=20)
    chk("email/send: already-used email → 400", r.status_code == 400,
        f"got {r.status_code} {r.text[:200]}")
    if r.status_code == 400:
        chk("email/send: error msg contains 'already used'",
            "already used" in r.text.lower(), f"text={r.text[:200]}")

    # 1e. No body → uses user's stored email. ava.email is "ava@bump.app" (real, not @phone.bump.app)
    # But this is same as current → uniqueness check skipped. Should send (200) unless rate-limited.
    # Make sure we don't conflict with rate limit on the same email — wait or use a different test.
    # Since ava@bump.app hasn't been the OTP target yet in this run, this should work:
    r = requests.post(f"{BASE}/account/email/send", json={}, headers=H_ava, timeout=20)
    chk("email/send: no body (uses user.email) → 200", r.status_code == 200,
        f"got {r.status_code} {r.text[:200]}")
    j2 = r.json() if r.status_code == 200 else {}
    chk("email/send: no body response sent=true", j2.get("sent") is True, f"resp={j2}")

    # ========================================================
    # 2. POST /api/account/email/confirm
    # ========================================================
    print("\n=== POST /api/account/email/confirm ===")

    # 2a. No auth → 401
    r = requests.post(f"{BASE}/account/email/confirm",
                      json={"code": "000000", "email": fresh_email}, timeout=20)
    chk("email/confirm: no auth → 401", r.status_code == 401, f"got {r.status_code} {r.text[:200]}")

    # 2b. Wrong code → 401
    r = requests.post(f"{BASE}/account/email/confirm",
                      json={"code": "000000", "email": fresh_email}, headers=H_ava, timeout=20)
    chk("email/confirm: wrong code → 401", r.status_code == 401,
        f"got {r.status_code} {r.text[:200]}")

    # 2c. Correct dev_code → 200, verified=true, user.email_verified=true, user.email updated
    if dev_code:
        r = requests.post(f"{BASE}/account/email/confirm",
                          json={"code": dev_code, "email": fresh_email}, headers=H_ava, timeout=20)
        chk("email/confirm: correct code → 200", r.status_code == 200,
            f"got {r.status_code} {r.text[:200]}")
        if r.status_code == 200:
            j = r.json()
            chk("email/confirm: verified=true", j.get("verified") is True, f"resp={j}")
            u = j.get("user") or {}
            chk("email/confirm: response contains full user obj",
                isinstance(u, dict) and "id" in u and "email" in u,
                f"user keys={list(u.keys())[:20]}")
            chk("email/confirm: user.email_verified=true",
                u.get("email_verified") is True, f"user.email_verified={u.get('email_verified')}")
            chk("email/confirm: user.email updated to new email",
                (u.get("email") or "").lower() == fresh_email.lower(),
                f"user.email={u.get('email')} expected={fresh_email}")

            # 2d. Verify /auth/me also shows email_verified=true and new email
            r2 = requests.get(f"{BASE}/auth/me", headers=H_ava, timeout=20)
            chk("after email confirm: /auth/me 200", r2.status_code == 200,
                f"got {r2.status_code} {r2.text[:200]}")
            if r2.status_code == 200:
                me = r2.json()
                chk("after email confirm: /auth/me email_verified=true",
                    me.get("email_verified") is True, f"me.email_verified={me.get('email_verified')}")
                chk("after email confirm: /auth/me email == fresh_email",
                    (me.get("email") or "").lower() == fresh_email.lower(),
                    f"me.email={me.get('email')}")
    else:
        FAILS.append(("email/confirm: skipped because no dev_code captured", "DEMO_MODE may be off"))

    # Restore ava's email back to ava@bump.app for future test runs
    # (only if we changed it). We send a new code, then confirm it.
    try:
        cur_email = (requests.get(f"{BASE}/auth/me", headers=H_ava, timeout=10).json().get("email") or "").lower()
        if cur_email != "ava@bump.app":
            time.sleep(31)  # wait out rate limit on the new fresh_email OTP target
            r = requests.post(f"{BASE}/account/email/send", json={"email": "ava@bump.app"},
                              headers=H_ava, timeout=20)
            if r.status_code == 200:
                rcode = r.json().get("dev_code")
                if rcode:
                    requests.post(f"{BASE}/account/email/confirm",
                                  json={"code": rcode, "email": "ava@bump.app"},
                                  headers=H_ava, timeout=20)
                    print("  (restored ava.email to ava@bump.app)")
    except Exception as e:
        print(f"  (restore step error: {e})")

    # ========================================================
    # 3. POST /api/account/phone/send
    # ========================================================
    print("\n=== POST /api/account/phone/send ===")

    # 3a. No auth → 401
    r = requests.post(f"{BASE}/account/phone/send", json={"phone": "+14155550100"}, timeout=20)
    chk("phone/send: no auth → 401", r.status_code == 401, f"got {r.status_code} {r.text[:200]}")

    # 3b. Invalid phone "415" → 400
    r = requests.post(f"{BASE}/account/phone/send", json={"phone": "415"}, headers=H_ava, timeout=20)
    chk("phone/send: invalid phone → 400", r.status_code == 400,
        f"got {r.status_code} {r.text[:200]}")
    if r.status_code == 400:
        chk("phone/send: error msg mentions E.164",
            "E.164" in r.text or "phone" in r.text.lower(), f"text={r.text[:200]}")

    # 3c. Phone already used by another user — need a phone owned by maya
    # First check maya's phone:
    maya_phone = maya_user.get("phone")
    if maya_phone:
        r = requests.post(f"{BASE}/account/phone/send", json={"phone": maya_phone},
                          headers=H_ava, timeout=20)
        chk("phone/send: already-used phone → 400", r.status_code == 400,
            f"got {r.status_code} {r.text[:200]}")
        if r.status_code == 400:
            chk("phone/send: error msg contains 'already used'",
                "already used" in r.text.lower(), f"text={r.text[:200]}")
    else:
        # Set maya's phone to a known value to test uniqueness? We don't have admin endpoint here.
        # Skip the already-used-phone test gracefully.
        print("  (skipping already-used-phone test: maya has no phone on file)")

    # 3d. Valid phone +14155550100 → 200 sent:true via Twilio Verify
    r = requests.post(f"{BASE}/account/phone/send", json={"phone": "+14155550100"},
                      headers=H_ava, timeout=30)
    chk("phone/send: valid phone → 200 (Twilio Verify)", r.status_code == 200,
        f"got {r.status_code} {r.text[:300]}")
    if r.status_code == 200:
        j = r.json()
        chk("phone/send: response sent=true", j.get("sent") is True, f"resp={j}")
    elif r.status_code == 503:
        FAILS.append(("phone/send: 503 phone auth unavailable",
                      "Twilio Verify service could not be created — check TWILIO env"))

    # ========================================================
    # 4. POST /api/account/phone/confirm
    # ========================================================
    print("\n=== POST /api/account/phone/confirm ===")

    # 4a. No auth → 401
    r = requests.post(f"{BASE}/account/phone/confirm",
                      json={"code": "000000", "phone": "+14155550100"}, timeout=20)
    chk("phone/confirm: no auth → 401", r.status_code == 401, f"got {r.status_code} {r.text[:200]}")

    # 4b. Bad code → 401 (or 400 because Twilio Verify rejects)
    r = requests.post(f"{BASE}/account/phone/confirm",
                      json={"code": "000000", "phone": "+14155550100"},
                      headers=H_ava, timeout=30)
    chk("phone/confirm: bad code → 401 or 400", r.status_code in (400, 401),
        f"got {r.status_code} {r.text[:200]}")

    # ========================================================
    # Summary
    # ========================================================
    print("\n" + "=" * 60)
    print(f"PASS: {len(PASSES)}  FAIL: {len(FAILS)}")
    if FAILS:
        print("\nFailures:")
        for n, d in FAILS:
            print(f"  ❌ {n}\n     {d}")
        sys.exit(1)
    print("All checks passed.")


if __name__ == "__main__":
    main()
