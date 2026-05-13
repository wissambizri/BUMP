"""
BUMP backend sanity tests — venue ordering + TTL indexes + auth sanity.
Targets the live preview URL via REACT_APP_BACKEND_URL/EXPO_PUBLIC_BACKEND_URL.
"""
import os
import sys
import uuid
import asyncio
import requests
from pathlib import Path
from dotenv import load_dotenv

# Load env
load_dotenv(Path("/app/frontend/.env"))
load_dotenv(Path("/app/backend/.env"))

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://bump-venue-live.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]

print(f"\n=== BUMP backend tests against {API} ===\n")

results = []


def record(name, ok, detail=""):
    mark = "✅" if ok else "❌"
    print(f"{mark} {name}" + (f" — {detail}" if detail else ""))
    results.append((name, ok, detail))


# -------------------- 1. Auth login --------------------
r = requests.post(f"{API}/auth/login", json={"email": "ava@bump.app", "password": "demo1234"}, timeout=15)
ok = r.status_code == 200 and "token" in r.json()
record("POST /auth/login ava@bump.app / demo1234", ok, f"HTTP {r.status_code}")
assert ok, r.text
TOKEN = r.json()["token"]
USER = r.json()["user"]
AUTH = {"Authorization": f"Bearer {TOKEN}"}

# /auth/me
r = requests.get(f"{API}/auth/me", headers=AUTH, timeout=15)
ok = r.status_code == 200 and r.json().get("id") == USER["id"]
record("GET /auth/me", ok, f"HTTP {r.status_code}")

# /auth/identify
r = requests.post(f"{API}/auth/identify", json={"identifier": "ava_nyc"}, timeout=15)
data = r.json() if r.ok else {}
ok = r.status_code == 200 and data.get("kind") == "username" and data.get("exists") is True
record("POST /auth/identify ava_nyc → kind=username", ok, f"HTTP {r.status_code} body={data}")

# /push/register
push_token = f"ExponentPushToken[sanity-{uuid.uuid4().hex[:10]}]"
r = requests.post(
    f"{API}/push/register",
    headers=AUTH,
    json={"token": push_token, "platform": "ios", "device_name": "SanityTest"},
    timeout=15,
)
ok = r.status_code == 200 and r.json().get("registered") is True
record("POST /push/register valid token", ok, f"HTTP {r.status_code}")
# clean up
requests.delete(f"{API}/push/register", headers=AUTH, params={"token": push_token}, timeout=15)


# -------------------- 2. Venue ordering --------------------
LAT, LNG = 40.758, -73.9855
r = requests.get(f"{API}/venues", headers=AUTH, params={"lat": LAT, "lng": LNG}, timeout=20)
ok = r.status_code == 200 and isinstance(r.json(), list) and len(r.json()) > 0
record(f"GET /venues?lat={LAT}&lng={LNG} → 200 with list", ok, f"HTTP {r.status_code} count={len(r.json()) if r.ok else 'n/a'}")
venues = r.json() if r.ok else []
assert venues, "no venues returned"

# Print top 10 for inspection
print("\n  Top 10 venues by kind/distance:")
for v in venues[:10]:
    print(f"    - {v.get('kind','?'):14s} rank={v.get('kind_rank','?')} dist={v.get('distance_m','?')}m  {v.get('name')}")

# Verify FIRST items are Nightclub/Lounge (kind_rank 0 or 1) if any exist
nc_lounge = [v for v in venues if v.get("kind") in ("Nightclub", "Lounge")]
if nc_lounge:
    # First Nightclub/Lounge should appear before first Bar/Restaurant
    first_nc_idx = next((i for i, v in enumerate(venues) if v.get("kind") in ("Nightclub", "Lounge")), None)
    first_resto_idx = next((i for i, v in enumerate(venues) if v.get("kind") == "Restaurant"), None)
    if first_resto_idx is not None and first_nc_idx is not None:
        ok = first_nc_idx < first_resto_idx
        record(
            "Ordering: first Nightclub/Lounge appears before first Restaurant",
            ok,
            f"nc/lounge idx={first_nc_idx}, restaurant idx={first_resto_idx}",
        )
    else:
        record("Ordering: only one kind present", True, "skipped (insufficient diversity)")
else:
    record("Ordering: no Nightclub/Lounge nearby", True, "skipped — Google did not return any in this radius")

# Verify ranking is monotonic (kind_rank non-decreasing across the list)
ranks = [v.get("kind_rank", 9) for v in venues]
ok = ranks == sorted(ranks)
record("Ordering: kind_rank non-decreasing across full list", ok, f"unique_ranks={sorted(set(ranks))}")

# Verify within each kind_rank, distance is non-decreasing
def check_distance_within_rank():
    by_rank = {}
    for v in venues:
        by_rank.setdefault(v.get("kind_rank"), []).append(v.get("distance_m") or 0)
    for k, ds in by_rank.items():
        if ds != sorted(ds):
            return False, f"rank {k} distances not sorted: {ds}"
    return True, ""

ok, detail = check_distance_within_rank()
record("Ordering: within each kind_rank, distance ascending", ok, detail)

# Verify a closer Restaurant does NOT come before a farther Nightclub
def check_closer_resto_not_before_farther_nc():
    nc = [v for v in venues if v.get("kind") == "Nightclub"]
    rest = [v for v in venues if v.get("kind") == "Restaurant"]
    if not nc or not rest:
        return None, "n/a (need both kinds)"
    # Find any Restaurant with smaller distance than a Nightclub
    closest_nc_dist = min(v.get("distance_m") or 0 for v in nc)
    closer_restos = [v for v in rest if (v.get("distance_m") or 0) < closest_nc_dist]
    if not closer_restos:
        return True, "no closer restos than nightclubs"
    # If such restaurants exist, they MUST appear AFTER all Nightclubs in `venues`
    last_nc_idx = max(i for i, v in enumerate(venues) if v.get("kind") == "Nightclub")
    closer_resto_indices = [i for i, v in enumerate(venues) if v.get("kind") == "Restaurant" and (v.get("distance_m") or 0) < closest_nc_dist]
    bad = [i for i in closer_resto_indices if i < last_nc_idx]
    if bad:
        return False, f"closer Restaurant at idx {bad} comes before Nightclub at idx {last_nc_idx}"
    return True, f"verified — {len(closer_restos)} closer restos all come after Nightclubs"

ok2, detail2 = check_closer_resto_not_before_farther_nc()
if ok2 is None:
    record("Ordering: closer Restaurant doesn't come before farther Nightclub", True, detail2)
else:
    record("Ordering: closer Restaurant doesn't come before farther Nightclub", ok2, detail2)

# -------------------- 3. Venue kind filter --------------------
for kind in ["Nightclub", "Bar", "Lounge"]:
    r = requests.get(f"{API}/venues", headers=AUTH, params={"lat": LAT, "lng": LNG, "kind": kind}, timeout=20)
    if r.status_code != 200:
        record(f"GET /venues?kind={kind} → 200", False, f"HTTP {r.status_code}")
        continue
    arr = r.json()
    if not isinstance(arr, list):
        record(f"GET /venues?kind={kind} → list", False, f"not a list")
        continue
    kinds_seen = set((v.get("kind") or "") for v in arr)
    if kind == "Lounge":
        # may be 0; if returned, all must equal Lounge
        ok = all((v.get("kind") == "Lounge") for v in arr)
        record(f"GET /venues?kind=Lounge — all items kind=Lounge (n={len(arr)})", ok, f"kinds_seen={kinds_seen}")
    else:
        ok = len(arr) > 0 and all((v.get("kind") == kind) for v in arr)
        record(f"GET /venues?kind={kind} — only {kind} (n={len(arr)})", ok, f"kinds_seen={kinds_seen}")

# Invalid kind → []
r = requests.get(f"{API}/venues", headers=AUTH, params={"lat": LAT, "lng": LNG, "kind": "Invalid"}, timeout=20)
ok = r.status_code == 200 and r.json() == []
record("GET /venues?kind=Invalid → []", ok, f"HTTP {r.status_code} body={r.json() if r.ok else r.text[:120]}")


# -------------------- 4. TTL indexes (direct MongoDB) --------------------
async def check_indexes():
    from motor.motor_asyncio import AsyncIOMotorClient
    cli = AsyncIOMotorClient(MONGO_URL)
    db = cli[DB_NAME]
    spec = [
        ("checkins", "expires_at", 0),
        ("messages", "created_at", 24 * 60 * 60),
        ("matches", "created_at", 24 * 60 * 60),
        ("push_tokens", "updated_at", 90 * 24 * 60 * 60),
    ]
    out = []
    for coll, field, expected_seconds in spec:
        idxs = await db[coll].index_information()
        found = None
        for name, info in idxs.items():
            keys = info.get("key", [])
            if (
                len(keys) == 1
                and keys[0][0] == field
                and "expireAfterSeconds" in info
            ):
                found = info["expireAfterSeconds"]
                break
        ok = found is not None and found == expected_seconds
        out.append((coll, field, expected_seconds, found, ok))
    cli.close()
    return out

ttl_results = asyncio.run(check_indexes())
for coll, field, expected, actual, ok in ttl_results:
    record(
        f"TTL index db.{coll} on {field} (expireAfter={expected}s)",
        ok,
        f"actual={actual}",
    )


# -------------------- summary --------------------
total = len(results)
passed = sum(1 for _, ok, _ in results if ok)
print(f"\n=== {passed}/{total} checks passed ===")
if passed != total:
    print("\nFailures:")
    for name, ok, detail in results:
        if not ok:
            print(f"  ❌ {name} — {detail}")
    sys.exit(1)
