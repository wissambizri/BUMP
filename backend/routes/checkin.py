"""Check-in CRUD + venue feed."""
import os
import uuid
from datetime import timedelta
from typing import Dict

from fastapi import APIRouter, Depends, HTTPException

from config import SELFIE_EXPIRE_HOURS
from db import db
from deps import utcnow, iso, haversine_m, get_user
from models import CheckinIn

router = APIRouter()


@router.post("/checkin")
async def checkin(body: CheckinIn, user: Dict = Depends(get_user)):
    venue = await db.venues.find_one({"id": body.venue_id}, {"_id": 0})
    if not venue:
        raise HTTPException(404, "Venue not found")
    distance = haversine_m(body.lat, body.lng, venue["lat"], venue["lng"])
    if distance > venue.get("geofence_radius_m", 200):
        if not user.get("is_admin") and os.environ.get("DEMO_MODE", "1") != "1":
            raise HTTPException(400, f"You need to be closer to this venue. {int(distance)}m away.")
    await db.checkins.delete_many({"user_id": user["id"]})
    now = utcnow()
    ci = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "venue_id": body.venue_id,
        "selfie_base64": body.selfie_base64,
        "lat": body.lat,
        "lng": body.lng,
        "checked_in_at": now,
        "expires_at": now + timedelta(hours=SELFIE_EXPIRE_HOURS),
    }
    await db.checkins.insert_one(ci.copy())
    ci.pop("_id", None)
    return {
        "id": ci["id"],
        "venue_id": ci["venue_id"],
        "checked_in_at": iso(ci["checked_in_at"]),
        "expires_at": iso(ci["expires_at"]),
    }


@router.delete("/checkin")
async def leave_venue(user: Dict = Depends(get_user)):
    await db.checkins.delete_many({"user_id": user["id"]})
    return {"ok": True}


@router.get("/checkin/active")
async def my_active_checkin(user: Dict = Depends(get_user)):
    now = utcnow()
    ci = await db.checkins.find_one(
        {"user_id": user["id"], "expires_at": {"$gt": now}}, {"_id": 0}
    )
    if not ci:
        return {"active": False}
    ci["checked_in_at"] = iso(ci["checked_in_at"])
    ci["expires_at"] = iso(ci["expires_at"])
    return {"active": True, "checkin": ci}


@router.get("/venues/{venue_id}/feed")
async def venue_feed(venue_id: str, user: Dict = Depends(get_user)):
    now = utcnow()
    checkins = await db.checkins.find(
        {"venue_id": venue_id, "expires_at": {"$gt": now}}, {"_id": 0}
    ).to_list(500)
    blocked = set(user.get("blocked_users", []))
    out = []
    for ci in checkins:
        if ci["user_id"] == user["id"]:
            continue
        if ci["user_id"] in blocked:
            continue
        u = await db.users.find_one(
            {"id": ci["user_id"], "is_hidden": {"$ne": True}},
            {"_id": 0, "password": 0, "email": 0},
        )
        if not u:
            continue
        if user["id"] in u.get("blocked_users", []):
            continue
        out.append({
            "user": u,
            "checked_in_at": iso(ci["checked_in_at"]),
            "venue_id": venue_id,
        })
    return out
