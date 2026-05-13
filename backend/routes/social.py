"""Likes, matches, messages (chat)."""
import uuid
import asyncio
from datetime import timedelta
from typing import Dict

from fastapi import APIRouter, Depends, HTTPException

from config import CHAT_EXPIRE_HOURS
from db import db
from deps import utcnow, ensure_aware, iso, get_user
from models import LikeIn, MessageIn, KeepIn
from services.push_service import send_push
from ws_manager import ws_manager

router = APIRouter()


@router.post("/likes")
async def like(body: LikeIn, user: Dict = Depends(get_user)):
    if body.action not in ("like", "hi", "pass"):
        raise HTTPException(400, "Invalid action")
    if body.target_user_id == user["id"]:
        raise HTTPException(400, "Cannot like yourself")
    rec = {
        "id": str(uuid.uuid4()),
        "from_user": user["id"],
        "to_user": body.target_user_id,
        "action": body.action,
        "created_at": utcnow(),
    }
    await db.likes.update_one(
        {"from_user": user["id"], "to_user": body.target_user_id},
        {"$set": rec},
        upsert=True,
    )
    if body.action == "pass":
        return {"matched": False}
    other = await db.likes.find_one({
        "from_user": body.target_user_id,
        "to_user": user["id"],
        "action": {"$in": ["like", "hi"]},
    })
    if not other:
        return {"matched": False}
    pair = sorted([user["id"], body.target_user_id])
    existing = await db.matches.find_one({"user_a": pair[0], "user_b": pair[1]})
    if existing:
        return {"matched": True, "match_id": existing["id"]}
    now = utcnow()
    match = {
        "id": str(uuid.uuid4()),
        "user_a": pair[0],
        "user_b": pair[1],
        "created_at": now,
        "expires_at": now + timedelta(hours=CHAT_EXPIRE_HOURS),
        "kept_by": [],
    }
    await db.matches.insert_one(match.copy())
    me_name = user.get("first_name", "Someone")
    them = await db.users.find_one({"id": body.target_user_id}, {"_id": 0, "first_name": 1})
    them_name = (them or {}).get("first_name", "Someone")
    asyncio.create_task(
        send_push(
            body.target_user_id,
            "It's a match! ⚡",
            f"You and {me_name} matched. Say hi!",
            {"type": "match", "match_id": match["id"]},
        )
    )
    asyncio.create_task(
        send_push(
            user["id"],
            "It's a match! ⚡",
            f"You and {them_name} matched. Say hi!",
            {"type": "match", "match_id": match["id"]},
        )
    )
    return {"matched": True, "match_id": match["id"]}


@router.get("/likes/received")
async def likes_received(user: Dict = Depends(get_user)):
    """Get pending waves/bumps received from active checkins (not yet matched)."""
    now = utcnow()
    # Find likes/his sent TO me where I haven't reciprocated yet
    incoming = await db.likes.find({
        "to_user": user["id"],
        "action": {"$in": ["like", "hi"]},
    }).sort("created_at", -1).to_list(500)
    out = []
    for l in incoming:
        from_uid = l["from_user"]
        # Check if I sent a like/hi back (then it's a match, skip)
        reciprocal = await db.likes.find_one({
            "from_user": user["id"],
            "to_user": from_uid,
            "action": {"$in": ["like", "hi"]},
        })
        if reciprocal:
            continue
        other = await db.users.find_one({"id": from_uid}, {"_id": 0, "password": 0, "email": 0})
        if not other:
            continue
        out.append({
            "id": l["id"],
            "action": l["action"],  # "like" or "hi"
            "user": other,
            "created_at": iso(l["created_at"]),
        })
    return out


@router.get("/matches")
async def list_matches(user: Dict = Depends(get_user)):
    now = utcnow()
    matches = await db.matches.find(
        {"$or": [{"user_a": user["id"]}, {"user_b": user["id"]}]}, {"_id": 0}
    ).sort("created_at", -1).to_list(500)
    out = []
    for m in matches:
        other_id = m["user_b"] if m["user_a"] == user["id"] else m["user_a"]
        other = await db.users.find_one({"id": other_id}, {"_id": 0, "password": 0, "email": 0})
        if not other:
            continue
        is_kept = len(m.get("kept_by", [])) >= 2
        exp_at = ensure_aware(m["expires_at"])
        expired = (not is_kept) and exp_at < now
        if expired:
            continue
        last_msg = await db.messages.find_one(
            {"match_id": m["id"]}, {"_id": 0}, sort=[("created_at", -1)]
        )
        out.append({
            "match_id": m["id"],
            "user": other,
            "created_at": iso(m["created_at"]),
            "expires_at": iso(m["expires_at"]),
            "kept": is_kept,
            "last_message": last_msg["text"] if last_msg else None,
            "last_message_at": iso(last_msg["created_at"]) if last_msg else None,
        })
    return out


@router.post("/matches/keep")
async def keep_match(body: KeepIn, user: Dict = Depends(get_user)):
    m = await db.matches.find_one({"id": body.match_id})
    if not m or user["id"] not in (m["user_a"], m["user_b"]):
        raise HTTPException(404, "Match not found")
    await db.matches.update_one(
        {"id": body.match_id}, {"$addToSet": {"kept_by": user["id"]}}
    )
    return {"ok": True}


@router.get("/messages/{match_id}")
async def get_messages(match_id: str, user: Dict = Depends(get_user)):
    m = await db.matches.find_one({"id": match_id})
    if not m or user["id"] not in (m["user_a"], m["user_b"]):
        raise HTTPException(404, "Match not found")
    msgs = await db.messages.find({"match_id": match_id}, {"_id": 0}).sort("created_at", 1).to_list(1000)
    await db.messages.update_many(
        {"match_id": match_id, "to_user": user["id"], "read": False},
        {"$set": {"read": True, "read_at": utcnow()}},
    )
    for msg in msgs:
        msg["created_at"] = iso(msg["created_at"])
        if msg.get("read_at"):
            msg["read_at"] = iso(msg["read_at"])
    return msgs


@router.post("/messages")
async def send_message(body: MessageIn, user: Dict = Depends(get_user)):
    m = await db.matches.find_one({"id": body.match_id})
    if not m or user["id"] not in (m["user_a"], m["user_b"]):
        raise HTTPException(404, "Match not found")
    other = m["user_b"] if m["user_a"] == user["id"] else m["user_a"]
    msg = {
        "id": str(uuid.uuid4()),
        "match_id": body.match_id,
        "from_user": user["id"],
        "to_user": other,
        "text": body.text,
        "read": False,
        "created_at": utcnow(),
    }
    await db.messages.insert_one(msg.copy())
    msg.pop("_id", None)
    msg["created_at"] = iso(msg["created_at"])
    await ws_manager.broadcast(body.match_id, {"type": "message", "message": msg})
    sender_name = user.get("first_name", "Someone")
    preview = body.text[:80]
    asyncio.create_task(
        send_push(
            other,
            f"{sender_name}",
            preview,
            {"type": "message", "match_id": body.match_id},
        )
    )
    return msg
