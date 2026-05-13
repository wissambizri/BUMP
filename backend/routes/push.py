"""Expo push token register/unregister."""
from typing import Dict

from fastapi import APIRouter, Depends, HTTPException

from db import db
from deps import utcnow, get_user
from models import PushRegisterIn

router = APIRouter()


@router.post("/push/register")
async def push_register(body: PushRegisterIn, user: Dict = Depends(get_user)):
    if not body.token or not body.token.startswith("ExponentPushToken"):
        raise HTTPException(400, "Invalid Expo push token")
    await db.push_tokens.update_one(
        {"token": body.token},
        {
            "$set": {
                "token": body.token,
                "user_id": user["id"],
                "platform": body.platform,
                "device_name": body.device_name,
                "updated_at": utcnow(),
            },
            "$setOnInsert": {"created_at": utcnow()},
        },
        upsert=True,
    )
    return {"registered": True}


@router.delete("/push/register")
async def push_unregister(token: str, user: Dict = Depends(get_user)):
    await db.push_tokens.delete_one({"token": token, "user_id": user["id"]})
    return {"ok": True}
