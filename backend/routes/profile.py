"""Profile updates + horoscope catalog."""
from typing import Dict

from fastapi import APIRouter, Depends, HTTPException

from db import db
from deps import utcnow, get_user
from models import ProfileIn
from services.auth_helpers import HOROSCOPE_SIGNS, HOROSCOPE_EMOJI, horoscope_from_birthday

router = APIRouter()


@router.get("/profile/horoscopes")
async def horoscope_options():
    return [{"sign": s, "emoji": HOROSCOPE_EMOJI[s]} for s in HOROSCOPE_SIGNS]


@router.put("/profile")
async def update_profile(body: ProfileIn, user: Dict = Depends(get_user)):
    updates = {k: v for k, v in body.dict().items() if v is not None}
    if "birthday" in updates and "horoscope" not in updates:
        derived = horoscope_from_birthday(updates["birthday"])
        if derived:
            updates["horoscope"] = derived
    if "horoscope" in updates and updates["horoscope"] and updates["horoscope"] not in HOROSCOPE_SIGNS:
        raise HTTPException(400, f"Invalid horoscope. Allowed: {', '.join(HOROSCOPE_SIGNS)}")
    if updates:
        updates["updated_at"] = utcnow()
        await db.users.update_one({"id": user["id"]}, {"$set": updates})
    updated = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password": 0})
    return updated
