"""Safety: report, block/unblock, hide."""
import uuid
from typing import Dict

from fastapi import APIRouter, Depends, HTTPException

from config import AUTO_HIDE_THRESHOLD, logger
from db import db
from deps import utcnow, get_user
from models import ReportIn
from services.auth_helpers import REPORT_CATEGORIES

router = APIRouter()


@router.get("/safety/report-categories")
async def safety_categories():
    return [{"code": k, "label": v} for k, v in REPORT_CATEGORIES.items()]


@router.get("/safety/blocked")
async def list_blocked(user: Dict = Depends(get_user)):
    ids = user.get("blocked_users", []) or []
    if not ids:
        return []
    cursor = db.users.find(
        {"id": {"$in": ids}},
        {"_id": 0, "id": 1, "first_name": 1, "username": 1, "photos": 1, "age": 1},
    )
    return await cursor.to_list(100)


@router.post("/safety/block/{target_id}")
async def block_user(target_id: str, user: Dict = Depends(get_user)):
    if target_id == user["id"]:
        raise HTTPException(400, "You can't block yourself")
    target = await db.users.find_one({"id": target_id}, {"_id": 0, "id": 1})
    if not target:
        raise HTTPException(404, "User not found")
    await db.users.update_one(
        {"id": user["id"]}, {"$addToSet": {"blocked_users": target_id}}
    )
    await db.matches.delete_many({
        "$or": [
            {"user_a": user["id"], "user_b": target_id},
            {"user_a": target_id, "user_b": user["id"]},
        ]
    })
    await db.likes.delete_many({
        "$or": [
            {"from_user": user["id"], "to_user": target_id},
            {"from_user": target_id, "to_user": user["id"]},
        ]
    })
    return {"ok": True}


@router.post("/safety/unblock/{target_id}")
async def unblock_user(target_id: str, user: Dict = Depends(get_user)):
    await db.users.update_one(
        {"id": user["id"]}, {"$pull": {"blocked_users": target_id}}
    )
    return {"ok": True}


@router.post("/safety/report")
async def report_user(body: ReportIn, user: Dict = Depends(get_user)):
    if body.target_user_id == user["id"]:
        raise HTTPException(400, "You can't report yourself")
    if body.reason not in REPORT_CATEGORIES:
        raise HTTPException(400, "Invalid reason code")
    target = await db.users.find_one({"id": body.target_user_id}, {"_id": 0, "id": 1})
    if not target:
        raise HTTPException(404, "User not found")
    existing = await db.reports.find_one(
        {"from_user": user["id"], "target_user": body.target_user_id, "status": "open"}
    )
    if existing:
        return {"ok": True, "report_id": existing["id"], "duplicate": True}
    rec = {
        "id": str(uuid.uuid4()),
        "from_user": user["id"],
        "target_user": body.target_user_id,
        "reason": body.reason,
        "reason_label": REPORT_CATEGORIES.get(body.reason, body.reason),
        "details": (body.details or "")[:500],
        "status": "open",
        "created_at": utcnow(),
    }
    await db.reports.insert_one(rec.copy())
    open_count = await db.reports.count_documents(
        {"target_user": body.target_user_id, "status": "open"}
    )
    if open_count >= AUTO_HIDE_THRESHOLD:
        await db.users.update_one(
            {"id": body.target_user_id},
            {
                "$set": {
                    "is_hidden": True,
                    "auto_hidden_at": utcnow(),
                    "auto_hidden_reports": open_count,
                }
            },
        )
        logger.warning(f"Auto-hid user {body.target_user_id} after {open_count} open reports")
    await db.users.update_one(
        {"id": user["id"]}, {"$addToSet": {"blocked_users": body.target_user_id}}
    )
    return {"ok": True, "report_id": rec["id"]}


@router.post("/safety/hide")
async def toggle_hide(hidden: bool = True, user: Dict = Depends(get_user)):
    await db.users.update_one({"id": user["id"]}, {"$set": {"is_hidden": hidden}})
    return {"ok": True, "hidden": hidden}
