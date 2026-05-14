"""Tests single-checkin enforcement on POST /api/checkin."""
import os
import sys
import requests

BASE = "https://bump-venue-live.preview.emergentagent.com/api"
EMAIL = "ava@bump.app"
PWD = "demo1234"
LAT = 40.7580
LNG = -73.9855
SELFIE = "data:image/jpeg;base64,/9j/"


def log(ok, msg):
    icon = "PASS" if ok else "FAIL"
    print(f"[{icon}] {msg}")
    return ok


def main() -> int:
    failures = []

    # 1) Login
    r = requests.post(f"{BASE}/auth/login", json={"email": EMAIL, "password": PWD}, timeout=30)
    if r.status_code != 200:
        print(f"Login failed: {r.status_code} {r.text}")
        return 1
    token = r.json()["token"]
    H = {"Authorization": f"Bearer {token}"}
    log(True, f"Login ava@bump.app → 200, token={token[:20]}...")

    # 2) Pick venues
    r = requests.get(f"{BASE}/venues", params={"lat": LAT, "lng": LNG}, headers=H, timeout=30)
    if r.status_code != 200:
        print(f"Venues fetch failed: {r.status_code} {r.text}")
        return 1
    venues = r.json()
    if len(venues) < 2:
        print(f"Need >=2 venues, got {len(venues)}")
        return 1
    venueA = venues[0]
    venueB = venues[1]
    log(True, f"Got {len(venues)} venues; A={venueA['name']!r} ({venueA['id']}), B={venueB['name']!r} ({venueB['id']})")

    # Clear any pre-existing checkin for clean state
    requests.delete(f"{BASE}/checkin", headers=H, timeout=30)

    payloadA = {"venue_id": venueA["id"], "lat": LAT, "lng": LNG, "selfie_base64": SELFIE}
    payloadB = {"venue_id": venueB["id"], "lat": LAT, "lng": LNG, "selfie_base64": SELFIE}

    # 3) First checkin to venueA
    r = requests.post(f"{BASE}/checkin", json=payloadA, headers=H, timeout=30)
    ok = r.status_code == 200 and r.json().get("venue_id") == venueA["id"]
    if not log(ok, f"Step 3: POST /checkin venueA → {r.status_code} body={r.text[:200]}"):
        failures.append("Step 3")

    # 4) Same venueA again — should refresh silently (200)
    r = requests.post(f"{BASE}/checkin", json=payloadA, headers=H, timeout=30)
    ok = r.status_code == 200 and r.json().get("venue_id") == venueA["id"]
    if not log(ok, f"Step 4: POST /checkin venueA (re-checkin) → {r.status_code} body={r.text[:200]}"):
        failures.append("Step 4")

    # 6) Different venue B → 409 with structured detail
    r = requests.post(f"{BASE}/checkin", json=payloadB, headers=H, timeout=30)
    body = None
    try:
        body = r.json()
    except Exception:
        pass

    detail = (body or {}).get("detail") if isinstance(body, dict) else None
    ok409 = r.status_code == 409
    ok_code = isinstance(detail, dict) and detail.get("code") == "already_checked_in"
    ok_aid = isinstance(detail, dict) and detail.get("active_venue_id") == venueA["id"]
    ok_aname = isinstance(detail, dict) and detail.get("active_venue_name") == venueA["name"]
    log(ok409, f"Step 6: POST /checkin venueB → status=409 (got {r.status_code})")
    log(ok_code, f"  detail.code == 'already_checked_in' (got {detail.get('code') if isinstance(detail, dict) else detail!r})")
    log(ok_aid, f"  detail.active_venue_id == venueA.id (got {detail.get('active_venue_id') if isinstance(detail, dict) else None!r})")
    log(ok_aname, f"  detail.active_venue_name == venueA.name (got {detail.get('active_venue_name') if isinstance(detail, dict) else None!r})")
    if not (ok409 and ok_code and ok_aid and ok_aname):
        failures.append("Step 6")

    # 7) DELETE /checkin
    r = requests.delete(f"{BASE}/checkin", headers=H, timeout=30)
    ok = r.status_code == 200 and r.json().get("ok") is True
    if not log(ok, f"Step 7: DELETE /checkin → {r.status_code} body={r.text[:200]}"):
        failures.append("Step 7")

    # 8) Retry POST venueB
    r = requests.post(f"{BASE}/checkin", json=payloadB, headers=H, timeout=30)
    ok = r.status_code == 200 and r.json().get("venue_id") == venueB["id"]
    if not log(ok, f"Step 8: POST /checkin venueB after leave → {r.status_code} body={r.text[:200]}"):
        failures.append("Step 8")

    # 9) GET /checkin/active → venueB
    r = requests.get(f"{BASE}/checkin/active", headers=H, timeout=30)
    body = r.json() if r.status_code == 200 else {}
    active_vid = body.get("checkin", {}).get("venue_id") if body.get("active") else None
    ok = r.status_code == 200 and body.get("active") is True and active_vid == venueB["id"]
    if not log(ok, f"Step 9: GET /checkin/active → active=True, venue_id={active_vid} (expected {venueB['id']})"):
        failures.append("Step 9")

    # Cleanup
    requests.delete(f"{BASE}/checkin", headers=H, timeout=30)

    print()
    if failures:
        print(f"FAILED steps: {failures}")
        return 1
    print("All single-checkin enforcement checks PASS.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
