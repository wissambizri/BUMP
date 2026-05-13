"""Google Places (New API v1) integration: nearby search, photo proxy helpers, kind mapping."""
import os
import uuid
import asyncio
import random
import base64
from datetime import timedelta
from typing import List, Optional, Dict, Any

import requests

from config import (
    GOOGLE_API_KEY,
    PLACES_RADIUS_M,
    PLACES_CACHE_TTL_SECONDS,
    SELFIE_EXPIRE_HOURS,
    logger,
    demo_mode,
)
from db import db
from deps import utcnow, ensure_aware, haversine_m

PLACES_NEARBY_URL = "https://places.googleapis.com/v1/places:searchNearby"
PLACES_PHOTO_BASE = "https://places.googleapis.com/v1"
NIGHTLIFE_TYPES = ["night_club", "bar", "wine_bar", "pub", "cocktail_bar"]
RESTAURANT_TYPES = ["restaurant", "fine_dining_restaurant"]
FIELD_MASK = ",".join([
    "places.id",
    "places.displayName",
    "places.location",
    "places.photos",
    "places.rating",
    "places.types",
    "places.primaryType",
    "places.formattedAddress",
    "places.shortFormattedAddress",
])

KIND_RANK = {
    "Nightclub": 0,
    "Lounge": 1,
    "Cocktail Bar": 2,
    "Wine Bar": 3,
    "Pub": 4,
    "Bar": 5,
    "Live Music": 6,
    "Fine Dining": 7,
    "Restaurant": 8,
    "Venue": 9,
}


def kind_rank(kind: Optional[str]) -> int:
    return KIND_RANK.get(kind or "Venue", 9)


def vibe_from_types(primary: Optional[str], types: List[str]) -> str:
    p = (primary or "").lower()
    t = [(x or "").lower() for x in (types or [])]
    ordered = [p] + t
    for x in ordered:
        if x == "night_club":
            return "Nightclub"
        if x == "cocktail_bar":
            return "Cocktail Bar"
        if x == "wine_bar":
            return "Wine Bar"
        if x == "pub":
            return "Pub"
        if x == "lounge_bar" or x == "rooftop":
            return "Rooftop Lounge"
        if x == "live_music_venue":
            return "Live Music"
        if x == "fine_dining_restaurant":
            return "Fine Dining"
        if x == "bar":
            return "Bar & Lounge"
        if x == "restaurant":
            return "Restaurant"
    return "Nightlife"


def kind_from_types(primary: Optional[str], types: List[str]) -> str:
    p = (primary or "").lower()
    t = set((x or "").lower() for x in (types or []))
    PRIORITY = [
        ("night_club", "Nightclub"),
        ("cocktail_lounge", "Lounge"),
        ("hookah_lounge", "Lounge"),
        ("cocktail_bar", "Cocktail Bar"),
        ("wine_bar", "Wine Bar"),
        ("pub", "Pub"),
        ("bar", "Bar"),
        ("live_music_venue", "Live Music"),
        ("fine_dining_restaurant", "Fine Dining"),
        ("restaurant", "Restaurant"),
    ]
    for key, label in PRIORITY:
        if p == key:
            return label
    for key, label in PRIORITY:
        if key in t:
            return label
    return "Venue"


def _call_places_nearby(lat: float, lng: float, included_types: List[str]) -> List[Dict[str, Any]]:
    if not GOOGLE_API_KEY:
        return []
    try:
        body = {
            "includedTypes": included_types,
            "maxResultCount": 20,
            "locationRestriction": {
                "circle": {
                    "center": {"latitude": lat, "longitude": lng},
                    "radius": float(PLACES_RADIUS_M),
                }
            },
        }
        headers = {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": GOOGLE_API_KEY,
            "X-Goog-FieldMask": FIELD_MASK,
        }
        r = requests.post(PLACES_NEARBY_URL, json=body, headers=headers, timeout=10)
        if r.status_code != 200:
            logger.warning(f"Places API HTTP {r.status_code}: {r.text[:200]}")
            return []
        return r.json().get("places", []) or []
    except Exception as e:
        logger.error(f"Places nearby err: {e}")
        return []


def fetch_google_places(lat: float, lng: float) -> List[Dict[str, Any]]:
    all_results: List[Dict[str, Any]] = []
    all_results.extend(_call_places_nearby(lat, lng, NIGHTLIFE_TYPES))
    all_results.extend(_call_places_nearby(lat, lng, RESTAURANT_TYPES))
    seen = set()
    unique = []
    for p in all_results:
        pid = p.get("id")
        if pid and pid not in seen:
            seen.add(pid)
            unique.append(p)
    return unique


async def populate_demo_checkins(lat: float, lng: float):
    nearby_venues = await db.venues.find({}, {"_id": 0}).to_list(50)
    nearby_venues = [v for v in nearby_venues if haversine_m(lat, lng, v["lat"], v["lng"]) <= PLACES_RADIUS_M * 1.5]
    if not nearby_venues:
        return
    demo_users = await db.users.find(
        {"email": {"$regex": "@bump.app$"}, "is_admin": {"$ne": True}}, {"_id": 0}
    ).to_list(50)
    now = utcnow()
    for u in demo_users:
        existing = await db.checkins.find_one({"user_id": u["id"], "expires_at": {"$gt": now}})
        if existing:
            continue
        v = random.choice(nearby_venues)
        ci = {
            "id": str(uuid.uuid4()),
            "user_id": u["id"],
            "venue_id": v["id"],
            "selfie_base64": (u.get("photos") or [""])[0],
            "lat": v["lat"],
            "lng": v["lng"],
            "checked_in_at": now,
            "expires_at": now + timedelta(hours=SELFIE_EXPIRE_HOURS),
        }
        await db.checkins.insert_one(ci)


async def upsert_google_venues(lat: float, lng: float) -> int:
    if not GOOGLE_API_KEY or (lat == 0 and lng == 0):
        return 0
    cell = f"{round(lat, 2)},{round(lng, 2)}"
    cache = await db.places_cache.find_one({"cell": cell})
    now = utcnow()
    if cache:
        cu = ensure_aware(cache["updated_at"])
        if (now - cu).total_seconds() < PLACES_CACHE_TTL_SECONDS:
            return 0
    places = await asyncio.to_thread(fetch_google_places, lat, lng)
    if not places:
        await db.places_cache.update_one(
            {"cell": cell},
            {"$set": {"cell": cell, "updated_at": now, "count": 0}},
            upsert=True,
        )
        return 0
    added = 0
    for p in places:
        pid = p.get("id")
        if not pid:
            continue
        loc = p.get("location") or {}
        vlat, vlng = loc.get("latitude"), loc.get("longitude")
        if vlat is None or vlng is None:
            continue
        photos = p.get("photos") or []
        photo_name = photos[0].get("name") if photos else None
        display = (p.get("displayName") or {}).get("text") or "Unknown venue"
        types = p.get("types") or []
        primary = p.get("primaryType")
        addr = p.get("shortFormattedAddress") or p.get("formattedAddress") or ""
        city = addr.split(",")[-2].strip() if addr.count(",") >= 1 else (addr.split(",")[-1].strip() or "Nearby")
        photo_token = base64.urlsafe_b64encode(photo_name.encode()).decode() if photo_name else None
        doc = {
            "name": display,
            "kind": kind_from_types(primary, types),
            "vibe": vibe_from_types(primary, types),
            "city": city,
            "lat": float(vlat),
            "lng": float(vlng),
            "place_id": pid,
            "photo_name": photo_name,
            "image": f"/api/venues/photo/{photo_token}" if photo_token else "",
            "rating": p.get("rating"),
            "address": addr,
            "types": types,
            "geofence_radius_m": 250,
            "source": "google",
        }
        existing = await db.venues.find_one({"place_id": pid})
        if existing:
            await db.venues.update_one(
                {"place_id": pid}, {"$set": {**doc, "updated_at": now}}
            )
        else:
            doc["id"] = str(uuid.uuid4())
            doc["created_at"] = now
            await db.venues.insert_one(doc)
            added += 1
    await db.places_cache.update_one(
        {"cell": cell},
        {"$set": {"cell": cell, "updated_at": now, "count": len(places)}},
        upsert=True,
    )
    if added > 0:
        logger.info(f"Discovered {added} new venues near {cell}")
        if demo_mode():
            await populate_demo_checkins(lat, lng)
    return added


def decode_photo_token(photo_token: str) -> str:
    pad = "=" * (-len(photo_token) % 4)
    return base64.urlsafe_b64decode(photo_token + pad).decode()
