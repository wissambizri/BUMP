"""Account verification + delete account."""
import asyncio
from datetime import timedelta
from typing import Dict, Any

from fastapi import APIRouter, Depends, HTTPException

from config import demo_mode, logger
from db import db
from deps import utcnow, ensure_aware, get_user
from models import (
    AccountEmailIn,
    AccountEmailConfirmIn,
    AccountPhoneIn,
    AccountPhoneConfirmIn,
)
from services.auth_helpers import (
    PHONE_RE,
    gen_otp_code,
    hash_otp,
    consume_email_otp,
)
from services.resend_service import send_email_otp
from services.twilio_service import get_twilio, ensure_verify_service

router = APIRouter()


@router.post("/account/email/send")
async def account_email_send(body: AccountEmailIn, user: Dict = Depends(get_user)):
    target_email = (body.email or user.get("email") or "").lower()
    if not target_email or target_email.endswith("@phone.bump.app"):
        raise HTTPException(400, "No email on file. Provide one to verify.")
    if "@" not in target_email or "." not in target_email:
        raise HTTPException(400, "Invalid email")
    current = (user.get("email") or "").lower()
    if target_email != current:
        if await db.users.find_one({"email": target_email, "id": {"$ne": user["id"]}}):
            raise HTTPException(400, "Email already used by another account")
    recent = await db.email_otps.find_one({"email": target_email, "purpose": "account"})
    if recent:
        created = ensure_aware(recent.get("created_at"))
        if created and (utcnow() - created).total_seconds() < 30:
            raise HTTPException(429, "Please wait before requesting another code")
    code = gen_otp_code()
    await db.email_otps.update_one(
        {"email": target_email, "purpose": "account"},
        {
            "$set": {
                "email": target_email,
                "purpose": "account",
                "code_hash": hash_otp(code),
                "expires_at": utcnow() + timedelta(minutes=10),
                "attempts": 0,
                "created_at": utcnow(),
                "user_id": user["id"],
            }
        },
        upsert=True,
    )
    sent = await send_email_otp(target_email, code, "signup")
    resp: Dict[str, Any] = {"sent": True}
    if demo_mode() and not sent:
        resp["dev_code"] = code
    return resp


@router.post("/account/email/confirm")
async def account_email_confirm(body: AccountEmailConfirmIn, user: Dict = Depends(get_user)):
    target_email = (body.email or user.get("email") or "").lower()
    ok = await consume_email_otp(target_email, body.code, "account")
    if not ok:
        raise HTTPException(401, "Invalid or expired code")
    update = {"email": target_email, "email_verified": True, "updated_at": utcnow()}
    await db.users.update_one({"id": user["id"]}, {"$set": update})
    u = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password": 0})
    return {"verified": True, "user": u}


@router.post("/account/phone/send")
async def account_phone_send(body: AccountPhoneIn, user: Dict = Depends(get_user)):
    target_phone = (body.phone or user.get("phone") or "").strip()
    if not PHONE_RE.match(target_phone):
        raise HTTPException(400, "Provide a phone in +E.164 format (+14155550100)")
    current = (user.get("phone") or "")
    if target_phone != current:
        if await db.users.find_one({"phone": target_phone, "id": {"$ne": user["id"]}}):
            raise HTTPException(400, "Phone already used by another account")
    cli = get_twilio()
    sid = await ensure_verify_service()
    if not cli or not sid:
        raise HTTPException(503, "Phone auth unavailable")
    try:
        await asyncio.to_thread(
            lambda: cli.verify.v2.services(sid).verifications.create(to=target_phone, channel="sms")
        )
    except Exception as e:
        logger.error(f"account phone send: {e}")
        raise HTTPException(400, "Could not send SMS")
    await db.users.update_one(
        {"id": user["id"]}, {"$set": {"pending_phone": target_phone}}
    )
    return {"sent": True}


@router.post("/account/phone/confirm")
async def account_phone_confirm(body: AccountPhoneConfirmIn, user: Dict = Depends(get_user)):
    target_phone = (body.phone or user.get("pending_phone") or user.get("phone") or "").strip()
    if not target_phone:
        raise HTTPException(400, "Missing phone")
    cli = get_twilio()
    sid = await ensure_verify_service()
    if not cli or not sid:
        raise HTTPException(503, "Phone auth unavailable")
    try:
        check = await asyncio.to_thread(
            lambda: cli.verify.v2.services(sid).verification_checks.create(to=target_phone, code=body.code)
        )
    except Exception as e:
        raise HTTPException(400, f"Verification failed: {e}")
    if check.status != "approved":
        raise HTTPException(401, "Invalid code")
    await db.users.update_one(
        {"id": user["id"]},
        {
            "$set": {"phone": target_phone, "phone_verified": True, "updated_at": utcnow()},
            "$unset": {"pending_phone": ""},
        },
    )
    u = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password": 0})
    return {"verified": True, "user": u}


@router.delete("/account")
async def delete_account(user: Dict = Depends(get_user)):
    uid = user["id"]
    await db.users.delete_one({"id": uid})
    await db.checkins.delete_many({"user_id": uid})
    await db.likes.delete_many({"$or": [{"from_user": uid}, {"to_user": uid}]})
    await db.matches.delete_many({"$or": [{"user_a": uid}, {"user_b": uid}]})
    await db.messages.delete_many({"$or": [{"from_user": uid}, {"to_user": uid}]})
    return {"ok": True}
