"""BUMP backend regression test — verifies zero regressions after refactor split.

Runs against EXPO_PUBLIC_BACKEND_URL (preview URL).
"""
import os
import sys
import time
import uuid
import json
import requests
from pymongo import MongoClient

BASE = "https://bump-venue-live.preview.emergentagent.com/api"
MONGO_URL = "mongodb://localhost:27017"
DB_NAME = "test_database"

results = []  # (section, name, passed, detail)


def record(section, name, passed, detail=""):
    results.append((section, name, passed, detail))
    flag = "PASS" if passed else "FAIL"
    print(f"[{flag}] {section}::{name} -- {detail}")


def login(email, pw):
    r = requests.post(f"{BASE}/auth/login", json={"email": email, "password": pw}, timeout=20)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    j = r.json()
    return j["token"], j["user"]


def auth_h(token):
    return {"Authorization": f"Bearer {token}"}


# ---------- 1) Sanity / auth ----------
def t_sanity():
    r = requests.get(f"{BASE}/", timeout=20)
    record("sanity", "GET /api/", r.status_code == 200 and r.json().get("app") == "BUMP", f"{r.status_code} {r.text[:80]}")

    r = requests.post(f"{BASE}/auth/login", json={"email": "ava@bump.app", "password": "demo1234"}, timeout=20)
    ok = r.status_code == 200 and "token" in r.json() and "user" in r.json()
    record("sanity", "POST /auth/login ava", ok, f"{r.status_code}")
    if not ok:
        return None, None
    token = r.json()["token"]
    user = r.json()["user"]

    r = requests.get(f"{BASE}/auth/me", headers=auth_h(token), timeout=20)
    record("sanity", "GET /auth/me", r.status_code == 200 and r.json().get("id") == user["id"], f"{r.status_code}")

    # identify
    r = requests.post(f"{BASE}/auth/identify", json={"identifier": "ava@bump.app"}, timeout=20)
    j = r.json() if r.status_code == 200 else {}
    record("sanity", "identify email exists", r.status_code == 200 and j.get("kind") == "email" and j.get("exists") is True and j.get("next") == "password", f"{r.status_code} {j}")

    r = requests.post(f"{BASE}/auth/identify", json={"identifier": "ava_nyc"}, timeout=20)
    j = r.json() if r.status_code == 200 else {}
    record("sanity", "identify username exists", r.status_code == 200 and j.get("kind") == "username" and j.get("exists") is True, f"{r.status_code} {j}")

    r = requests.post(f"{BASE}/auth/identify", json={"identifier": "+14155550199"}, timeout=20)
    j = r.json() if r.status_code == 200 else {}
    record("sanity", "identify phone fresh", r.status_code == 200 and j.get("kind") == "phone" and j.get("exists") is False and j.get("next") == "otp_phone", f"{r.status_code} {j}")

    r = requests.post(f"{BASE}/auth/identify", json={"identifier": "abc"}, timeout=20)
    record("sanity", "identify unknown username 404", r.status_code == 404, f"{r.status_code}")

    r = requests.post(f"{BASE}/auth/identify", json={"identifier": "ab"}, timeout=20)
    record("sanity", "identify too short 400", r.status_code == 400, f"{r.status_code}")

    return token, user


# ---------- 2) Venues ordering ----------
def t_venues(token):
    r = requests.get(f"{BASE}/venues", params={"lat": 40.758, "lng": -73.9855}, headers=auth_h(token), timeout=30)
    if r.status_code != 200:
        record("venues", "GET /venues NYC", False, f"{r.status_code} {r.text[:80]}")
        return
    venues = r.json()
    record("venues", "GET /venues NYC >=35", len(venues) >= 35, f"got {len(venues)}")

    if not venues:
        return

    top = venues[0]
    nc_ok = top.get("kind") == "Nightclub" and top.get("kind_rank") == 0
    # find first Bar
    bars = [v for v in venues if v.get("kind") == "Bar"]
    bar_dists_lower = bars and all(top.get("distance_m", 0) > b.get("distance_m", 0) for b in bars[:3])
    record("venues", "top is Nightclub", nc_ok, f"top kind={top.get('kind')} rank={top.get('kind_rank')} dist={top.get('distance_m')}")
    record("venues", "Nightclub farther than top Bars", bool(bar_dists_lower), f"top_dist={top.get('distance_m')} bar_dists={[b.get('distance_m') for b in bars[:3]]}")

    ranks = [v.get("kind_rank") for v in venues]
    non_decreasing = all(ranks[i] <= ranks[i + 1] for i in range(len(ranks) - 1))
    record("venues", "kind_rank non-decreasing", non_decreasing, f"unique ranks={sorted(set(ranks))}")

    # filters
    for kind in ("Bar", "Nightclub"):
        r = requests.get(f"{BASE}/venues", params={"lat": 40.758, "lng": -73.9855, "kind": kind}, headers=auth_h(token), timeout=30)
        js = r.json() if r.status_code == 200 else []
        ok = r.status_code == 200 and all(v.get("kind") == kind for v in js) and len(js) > 0
        record("venues", f"?kind={kind} all match", ok, f"n={len(js)}")

    r = requests.get(f"{BASE}/venues", params={"lat": 40.758, "lng": -73.9855, "kind": "Invalid"}, headers=auth_h(token), timeout=30)
    record("venues", "?kind=Invalid → []", r.status_code == 200 and r.json() == [], f"{r.status_code} len={len(r.json()) if r.status_code==200 else 'NA'}")


# ---------- 3) Account verification ----------
def t_account(token):
    # restore ava email at end
    new_email = f"new+regression_{uuid.uuid4().hex[:6]}@bump.app"

    # no auth
    r = requests.post(f"{BASE}/account/email/send", json={"email": new_email}, timeout=20)
    record("account", "email/send no auth 401", r.status_code == 401, f"{r.status_code}")

    # send
    r = requests.post(f"{BASE}/account/email/send", json={"email": new_email}, headers=auth_h(token), timeout=20)
    js = r.json() if r.status_code == 200 else {}
    dev_code = js.get("dev_code")
    record("account", "email/send fresh", r.status_code == 200 and js.get("sent") is True and dev_code, f"{r.status_code} keys={list(js.keys())}")

    # rate limit
    r2 = requests.post(f"{BASE}/account/email/send", json={"email": new_email}, headers=auth_h(token), timeout=20)
    record("account", "email/send rate 429", r2.status_code == 429, f"{r2.status_code}")

    # taken
    r3 = requests.post(f"{BASE}/account/email/send", json={"email": "maya@bump.app"}, headers=auth_h(token), timeout=20)
    record("account", "email/send taken 400", r3.status_code == 400 and "already used" in r3.text.lower(), f"{r3.status_code} {r3.text[:80]}")

    # confirm wrong code (no auth)
    r = requests.post(f"{BASE}/account/email/confirm", json={"code": "000000"}, timeout=20)
    record("account", "email/confirm no auth 401", r.status_code == 401, f"{r.status_code}")

    r = requests.post(f"{BASE}/account/email/confirm", json={"code": "000000"}, headers=auth_h(token), timeout=20)
    record("account", "email/confirm bad code 401", r.status_code == 401, f"{r.status_code}")

    if dev_code:
        r = requests.post(f"{BASE}/account/email/confirm", json={"code": dev_code, "email": new_email}, headers=auth_h(token), timeout=20)
        js = r.json() if r.status_code == 200 else {}
        u = js.get("user", {})
        ok = r.status_code == 200 and js.get("verified") is True and u.get("email_verified") is True and u.get("email") == new_email
        record("account", "email/confirm correct code", ok, f"{r.status_code} verified={js.get('verified')} email={u.get('email')} ev={u.get('email_verified')}")
        # restore ava
        try:
            mc = MongoClient(MONGO_URL)
            mc[DB_NAME]["users"].update_one({"email": new_email}, {"$set": {"email": "ava@bump.app"}})
            mc.close()
        except Exception as e:
            print("cleanup err", e)

    # phone
    r = requests.post(f"{BASE}/account/phone/send", json={"phone": "+14155550100"}, headers=auth_h(token), timeout=20)
    # Expected 400 due to Twilio trial OR 200; either is acceptable. Spec says 400 (trial mode).
    record("account", "phone/send +14155550100 400 (twilio trial)", r.status_code == 400, f"{r.status_code} {r.text[:80]}")

    r = requests.post(f"{BASE}/account/phone/send", json={"phone": "415"}, headers=auth_h(token), timeout=20)
    record("account", "phone/send 415 → 400 E.164", r.status_code == 400 and "E.164" in r.text, f"{r.status_code} {r.text[:80]}")

    r = requests.post(f"{BASE}/account/phone/send", json={"phone": "+14155550100"}, timeout=20)
    record("account", "phone/send no auth 401", r.status_code == 401, f"{r.status_code}")


# ---------- 4) Push ----------
def t_push(token):
    tk = f"ExponentPushToken[regr{uuid.uuid4().hex[:6]}]"
    r = requests.post(f"{BASE}/push/register", json={"token": tk, "platform": "ios"}, headers=auth_h(token), timeout=20)
    record("push", "register valid", r.status_code == 200 and r.json().get("registered") is True, f"{r.status_code} {r.text[:80]}")

    r = requests.delete(f"{BASE}/push/register", params={"token": tk}, headers=auth_h(token), timeout=20)
    record("push", "delete", r.status_code == 200, f"{r.status_code} {r.text[:80]}")

    r = requests.post(f"{BASE}/push/register", json={"token": tk, "platform": "ios"}, timeout=20)
    record("push", "register no auth 401", r.status_code == 401, f"{r.status_code}")

    r = requests.post(f"{BASE}/push/register", json={"token": "notatoken", "platform": "ios"}, headers=auth_h(token), timeout=20)
    record("push", "register invalid 400", r.status_code == 400 and "Invalid Expo push token" in r.text, f"{r.status_code} {r.text[:80]}")


# ---------- 5) Safety ----------
def t_safety(ava_token, maya_user_id):
    r = requests.get(f"{BASE}/safety/report-categories", timeout=20)
    cats = r.json() if r.status_code == 200 else []
    record("safety", "report-categories =7", r.status_code == 200 and len(cats) == 7, f"{r.status_code} n={len(cats)}")

    # report ava→maya, reason=spam
    r = requests.post(f"{BASE}/safety/report", json={"target_user_id": maya_user_id, "reason": "spam"}, headers=auth_h(ava_token), timeout=20)
    js = r.json() if r.status_code == 200 else {}
    first_rid = js.get("report_id")
    record("safety", "report spam ok", r.status_code == 200 and js.get("ok") is True and first_rid and not js.get("duplicate"), f"{r.status_code} {js}")

    # duplicate
    r = requests.post(f"{BASE}/safety/report", json={"target_user_id": maya_user_id, "reason": "spam"}, headers=auth_h(ava_token), timeout=20)
    js2 = r.json() if r.status_code == 200 else {}
    record("safety", "report duplicate", r.status_code == 200 and js2.get("duplicate") is True and js2.get("report_id") == first_rid, f"{r.status_code} {js2}")

    # self report
    r = requests.post(f"{BASE}/safety/report", json={"target_user_id": "ava-self-id", "reason": "spam"}, headers=auth_h(ava_token), timeout=20)
    # need ava's id
    me = requests.get(f"{BASE}/auth/me", headers=auth_h(ava_token), timeout=20).json()
    r = requests.post(f"{BASE}/safety/report", json={"target_user_id": me["id"], "reason": "spam"}, headers=auth_h(ava_token), timeout=20)
    record("safety", "report self 400", r.status_code == 400, f"{r.status_code}")

    # invalid reason
    r = requests.post(f"{BASE}/safety/report", json={"target_user_id": maya_user_id, "reason": "xyz"}, headers=auth_h(ava_token), timeout=20)
    record("safety", "report invalid reason 400", r.status_code == 400, f"{r.status_code}")

    # nonexistent target
    r = requests.post(f"{BASE}/safety/report", json={"target_user_id": str(uuid.uuid4()), "reason": "spam"}, headers=auth_h(ava_token), timeout=20)
    record("safety", "report nonexistent 404", r.status_code == 404, f"{r.status_code}")

    # block / unblock
    r = requests.post(f"{BASE}/safety/block/{maya_user_id}", headers=auth_h(ava_token), timeout=20)
    record("safety", "block maya", r.status_code == 200, f"{r.status_code}")

    r = requests.get(f"{BASE}/safety/blocked", headers=auth_h(ava_token), timeout=20)
    js = r.json() if r.status_code == 200 else []
    has_maya = any(u.get("id") == maya_user_id for u in js)
    record("safety", "blocked contains maya", r.status_code == 200 and has_maya, f"{r.status_code} n={len(js)} has_maya={has_maya}")

    r = requests.post(f"{BASE}/safety/unblock/{maya_user_id}", headers=auth_h(ava_token), timeout=20)
    record("safety", "unblock maya", r.status_code == 200, f"{r.status_code}")

    r = requests.get(f"{BASE}/safety/blocked", headers=auth_h(ava_token), timeout=20)
    js = r.json() if r.status_code == 200 else []
    has_maya = any(u.get("id") == maya_user_id for u in js)
    record("safety", "blocked no longer has maya", r.status_code == 200 and not has_maya, f"{r.status_code} n={len(js)}")


# ---------- 6) Profile ----------
def t_profile(token):
    r = requests.get(f"{BASE}/profile/horoscopes", timeout=20)
    js = r.json() if r.status_code == 200 else []
    ok = r.status_code == 200 and len(js) == 12 and all("sign" in x and "emoji" in x for x in js)
    record("profile", "horoscopes 12", ok, f"{r.status_code} n={len(js)}")

    body = {
        "gender": "Female",
        "interested_in": "Men",
        "bio": "test bio regression",
        "interests": ["music", "nightlife"],
        "horoscope": "Leo",
        "hide_age": True,
    }
    r = requests.put(f"{BASE}/profile", json=body, headers=auth_h(token), timeout=20)
    js = r.json() if r.status_code == 200 else {}
    ok = (r.status_code == 200 and js.get("horoscope") == "Leo" and js.get("hide_age") is True
          and js.get("gender") == "Female" and js.get("interested_in") == "Men")
    record("profile", "PUT /profile applied", ok, f"{r.status_code} horoscope={js.get('horoscope')} hide_age={js.get('hide_age')}")


# ---------- 7) TTL indexes ----------
def t_ttl():
    try:
        mc = MongoClient(MONGO_URL)
        db = mc[DB_NAME]
        expected = {
            "checkins": ("expires_at", 0),
            "messages": ("created_at", 86400),
            "matches": ("created_at", 86400),
            "push_tokens": ("updated_at", 7776000),
        }
        for coll, (field, secs) in expected.items():
            info = db[coll].index_information()
            found = False
            for name, meta in info.items():
                keys = [k[0] for k in meta.get("key", [])]
                if keys == [field] and meta.get("expireAfterSeconds") == secs:
                    found = True
                    break
            record("ttl", f"{coll}.{field}={secs}", found, f"info_count={len(info)}")
        mc.close()
    except Exception as e:
        record("ttl", "mongo connect", False, str(e))


def main():
    print(f"BASE = {BASE}")
    token, user = t_sanity()
    if not token:
        print("sanity failed; aborting")
        return summarize()

    # Get maya id
    r = requests.post(f"{BASE}/auth/login", json={"email": "maya@bump.app", "password": "demo1234"}, timeout=20)
    if r.status_code == 200:
        maya_id = r.json()["user"]["id"]
    else:
        maya_id = None

    t_venues(token)
    t_account(token)
    t_push(token)
    if maya_id:
        t_safety(token, maya_id)
    t_profile(token)
    t_ttl()
    return summarize()


def summarize():
    print("\n" + "=" * 60)
    secs = {}
    for sec, name, ok, detail in results:
        d = secs.setdefault(sec, [0, 0, []])
        d[0] += 1
        if ok:
            d[1] += 1
        else:
            d[2].append((name, detail))
    total = sum(d[0] for d in secs.values())
    passed = sum(d[1] for d in secs.values())
    print(f"TOTAL: {passed}/{total} passed")
    for sec, (n, p, fails) in secs.items():
        print(f"  {sec}: {p}/{n}")
        for name, detail in fails:
            print(f"    FAIL: {name} -- {detail}")
    return passed == total


if __name__ == "__main__":
    ok = main()
    sys.exit(0 if ok else 1)
