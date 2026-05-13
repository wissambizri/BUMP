"""Admin: analytics, users, reports moderation."""
from typing import Dict

from fastapi import APIRouter, Depends

from db import db
from deps import utcnow, iso, get_admin

router = APIRouter()


@router.get("/admin/analytics")
async def admin_analytics(admin: Dict = Depends(get_admin)):
    now = utcnow()
    return {
        "total_users": await db.users.count_documents({}),
        "total_venues": await db.venues.count_documents({}),
        "active_checkins": await db.checkins.count_documents({"expires_at": {"$gt": now}}),
        "total_matches": await db.matches.count_documents({}),
        "total_messages": await db.messages.count_documents({}),
        "open_reports": await db.reports.count_documents({"status": "open"}),
    }


@router.get("/admin/users")
async def admin_users(admin: Dict = Depends(get_admin)):
    users = await db.users.find({}, {"_id": 0, "password": 0}).to_list(500)
    return users


@router.get("/admin/reports")
async def admin_reports(admin: Dict = Depends(get_admin)):
    reports = await db.reports.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    for r in reports:
        r["created_at"] = iso(r["created_at"])
    return reports


@router.post("/admin/reports/{report_id}/resolve")
async def admin_resolve(report_id: str, admin: Dict = Depends(get_admin)):
    await db.reports.update_one({"id": report_id}, {"$set": {"status": "resolved"}})
    return {"ok": True}


@router.post("/admin/users/{user_id}/suspend")
async def admin_suspend(user_id: str, admin: Dict = Depends(get_admin)):
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"is_hidden": True, "is_suspended": True, "suspended_at": utcnow()}},
    )
    return {"ok": True}


@router.post("/admin/users/{user_id}/unsuspend")
async def admin_unsuspend(user_id: str, admin: Dict = Depends(get_admin)):
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"is_hidden": False, "is_suspended": False}, "$unset": {"suspended_at": ""}},
    )
    await db.reports.update_many(
        {"target_user": user_id, "status": "open"}, {"$set": {"status": "resolved"}}
    )
    return {"ok": True}


@router.delete("/admin/users/{user_id}")
async def admin_delete_user(user_id: str, admin: Dict = Depends(get_admin)):
    await db.users.delete_one({"id": user_id})
    await db.checkins.delete_many({"user_id": user_id})
    return {"ok": True}
