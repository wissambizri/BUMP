"""Venues list, photo proxy, single venue."""
import asyncio
from typing import Dict, Optional

import requests
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from config import GOOGLE_API_KEY, PLACES_RADIUS_M, logger
from db import db
from deps import utcnow, haversine_m, get_user
from services.places_service import (
    upsert_google_venues,
    kind_rank,
    decode_photo_token,
    PLACES_PHOTO_BASE,
)

router = APIRouter()


@router.get("/venues")
async def list_venues(
    lat: float = 0,
    lng: float = 0,
    refresh: int = 0,
    kind: Optional[str] = None,
    user: Dict = Depends(get_user),
):
    if refresh and (lat != 0 or lng != 0):
        cell = f"{round(lat, 2)},{round(lng, 2)}"
        await db.places_cache.delete_one({"cell": cell})
    if lat != 0 or lng != 0:
        try:
            await upsert_google_venues(lat, lng)
        except Exception as e:
            logger.error(f"Places upsert err: {e}")
    venues = await db.venues.find({}, {"_id": 0}).to_list(500)
    now = utcnow()
    out = []
    for v in venues:
        if (v.get("kind") or "") in ("Bar", "Cocktail Bar", "Venue") and "lounge" in (v.get("name") or "").lower():
            v["kind"] = "Lounge"
        if kind and (v.get("kind") or "").lower() != kind.lower():
            continue
        v["distance_m"] = int(haversine_m(lat, lng, v["lat"], v["lng"])) if (lat or lng) else None
        if (lat or lng) and v["distance_m"] is not None and v["distance_m"] > PLACES_RADIUS_M * 2:
            continue
        active = await db.checkins.count_documents({
            "venue_id": v["id"],
            "expires_at": {"$gt": now},
        })
        v["active_count"] = active
        v["kind_rank"] = kind_rank(v.get("kind"))
        out.append(v)
    if lat or lng:
        out.sort(key=lambda x: (x.get("kind_rank", 9), x.get("distance_m") or 0))
    else:
        out.sort(key=lambda x: (x.get("kind_rank", 9), -(x.get("active_count") or 0)))
    return out


@router.get("/venues/photo/{photo_token}")
async def venue_photo(photo_token: str, maxwidth: int = 800):
    if not GOOGLE_API_KEY:
        raise HTTPException(404, "Photo unavailable")
    try:
        photo_name = decode_photo_token(photo_token)
    except Exception:
        raise HTTPException(400, "Invalid photo token")
    url = f"{PLACES_PHOTO_BASE}/{photo_name}/media"
    try:
        params = {"maxWidthPx": maxwidth, "key": GOOGLE_API_KEY}
        r = await asyncio.to_thread(
            requests.get, url, params=params, stream=True, timeout=12, allow_redirects=True
        )
        if r.status_code != 200:
            logger.warning(f"Photo fetch {r.status_code}: {r.text[:120] if hasattr(r, 'text') else ''}")
            raise HTTPException(404, "Photo not found")
        content_type = r.headers.get("content-type", "image/jpeg")

        def iterator():
            for chunk in r.iter_content(chunk_size=8192):
                if chunk:
                    yield chunk

        return StreamingResponse(iterator(), media_type=content_type)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Photo proxy err: {e}")
        raise HTTPException(500, "Photo fetch failed")


@router.get("/venues/{venue_id}")
async def get_venue(venue_id: str, user: Dict = Depends(get_user)):
    v = await db.venues.find_one({"id": venue_id}, {"_id": 0})
    if not v:
        raise HTTPException(404, "Venue not found")
    now = utcnow()
    v["active_count"] = await db.checkins.count_documents({
        "venue_id": venue_id,
        "expires_at": {"$gt": now},
    })
    return v
