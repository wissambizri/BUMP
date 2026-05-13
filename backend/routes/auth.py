"""Auth routes: legacy register/login + unified identifier/email-otp/signup/login/forgot/reset + legacy phone/google."""
import uuid
import asyncio
import secrets as _secrets
from datetime import timedelta
from typing import Dict, Optional

import jwt
import httpx
from fastapi import APIRouter, Depends, HTTPException

from config import (
    SECRET_KEY,
    ALGORITHM,
    EMERGENT_AUTH_API,
    demo_mode,
    logger,
)
from db import db
from deps import (
    utcnow,
    ensure_aware,
    hash_pwd,
    check_pwd,
    make_token,
    clean_user,
    get_user,
)
from models import (
    RegisterIn,
    LoginIn,
    IdentifierIn,
    UnifiedLoginIn,
    UnifiedSignupIn,
    EmailOtpSendIn,
    EmailOtpVerifyIn,
    ResetRequestIn,
    ResetConfirmIn,
    UsernameCheckIn,
    PhoneSendIn,
    PhoneVerifyIn,
    GoogleSessionIn,
)
from services.auth_helpers import (
    USERNAME_RE,
    detect_identifier_type,
    normalize_identifier,
    find_user_by_identifier,
    gen_otp_code,
    hash_otp,
    consume_email_otp,
    consume_scope_token,
)
from services.resend_service import send_email_otp, send_email_reset_link
from services.twilio_service import get_twilio, ensure_verify_service

router = APIRouter()


# -------- legacy --------
@router.post("/auth/register")
async def register(body: RegisterIn):
    existing = await db.users.find_one({"email": body.email.lower()})
    if existing:
        raise HTTPException(400, "Email already registered")
    uid = str(uuid.uuid4())
    user = {
        "id": uid,
        "email": body.email.lower(),
        "password": hash_pwd(body.password),
        "first_name": body.first_name,
        "age": body.age,
        "gender": None,
        "interested_in": None,
        "bio": "",
        "interests": [],
        "photos": [],
        "is_admin": False,
        "is_hidden": False,
        "blocked_users": [],
        "created_at": utcnow(),
    }
    await db.users.insert_one(user.copy())
    token = make_token(uid)
    return {"token": token, "user": clean_user(user)}


@router.post("/auth/login")
async def login(body: LoginIn):
    user = await db.users.find_one({"email": body.email.lower()})
    if not user or not check_pwd(body.password, user["password"]):
        raise HTTPException(401, "Invalid credentials")
    token = make_token(user["id"])
    return {"token": token, "user": clean_user(user)}


@router.get("/auth/me")
async def me(user: Dict = Depends(get_user)):
    return user


# -------- unified --------
@router.post("/auth/identify")
async def auth_identify(body: IdentifierIn):
    kind = detect_identifier_type(body.identifier)
    if not kind:
        raise HTTPException(400, "Enter a valid email, phone (+1234567890), or username (3–20 letters/digits/_)")
    user = await find_user_by_identifier(body.identifier)
    if user:
        if kind == "phone":
            return {"kind": "phone", "exists": True, "next": "otp_phone"}
        return {
            "kind": kind,
            "exists": True,
            "next": "password",
            "has_email": bool(user.get("email") and not user["email"].endswith("@phone.bump.app")),
        }
    if kind == "username":
        raise HTTPException(404, "Username not found. Sign up with email or phone first.")
    if kind == "phone":
        return {"kind": "phone", "exists": False, "next": "otp_phone"}
    return {"kind": "email", "exists": False, "next": "otp_email"}


@router.post("/auth/username/check")
async def username_check(body: UsernameCheckIn):
    u = (body.username or "").strip().lower()
    if not USERNAME_RE.match(u):
        return {"available": False, "reason": "Must be 3–20 letters, digits, or underscore"}
    exists = await db.users.find_one({"username": u})
    if exists:
        return {"available": False, "reason": "Username taken"}
    return {"available": True}


@router.post("/auth/email/send")
async def email_otp_send(body: EmailOtpSendIn):
    email = body.email.lower()
    if body.purpose not in ("signup", "login", "reset"):
        raise HTTPException(400, "Invalid purpose")
    recent = await db.email_otps.find_one({"email": email, "purpose": body.purpose})
    if recent:
        created = ensure_aware(recent.get("created_at"))
        if created and (utcnow() - created).total_seconds() < 30:
            raise HTTPException(429, "Please wait a moment before requesting another code")
    user = await db.users.find_one({"email": email})
    if body.purpose == "signup" and user:
        raise HTTPException(400, "Email already registered. Try logging in.")
    if body.purpose in ("login", "reset") and not user:
        return {"sent": True}
    code = gen_otp_code()
    await db.email_otps.update_one(
        {"email": email, "purpose": body.purpose},
        {
            "$set": {
                "email": email,
                "purpose": body.purpose,
                "code_hash": hash_otp(code),
                "expires_at": utcnow() + timedelta(minutes=10),
                "attempts": 0,
                "created_at": utcnow(),
            }
        },
        upsert=True,
    )
    sent = await send_email_otp(email, code, body.purpose)
    if not sent and not demo_mode():
        raise HTTPException(503, "Email service unavailable")
    resp = {"sent": True}
    if demo_mode() and not sent:
        resp["dev_code"] = code
    return resp


@router.post("/auth/email/verify")
async def email_otp_verify(body: EmailOtpVerifyIn):
    email = body.email.lower()
    ok = await consume_email_otp(email, body.code, body.purpose)
    if not ok:
        raise HTTPException(401, "Invalid or expired code")
    payload = {
        "scope": f"verified_{body.purpose}",
        "email": email,
        "exp": utcnow() + timedelta(minutes=15),
    }
    token = jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)
    return {"verified": True, "scope_token": token}


@router.post("/auth/signup")
async def unified_signup(body: UnifiedSignupIn):
    kind = detect_identifier_type(body.identifier)
    if kind not in ("email", "phone"):
        raise HTTPException(400, "Sign up with a valid email or phone number")
    if not body.first_name or len(body.first_name.strip()) < 1:
        raise HTTPException(400, "First name is required")
    username = (body.username or "").strip().lower() if body.username else None
    if username:
        if not USERNAME_RE.match(username):
            raise HTTPException(400, "Username must be 3–20 letters/digits/underscore")
        if await db.users.find_one({"username": username}):
            raise HTTPException(400, "Username taken")

    if kind == "email":
        email = normalize_identifier(body.identifier, "email")
        if not body.code:
            raise HTTPException(400, "Verify your email first")
        verified_email = consume_scope_token(body.code, "signup")
        if verified_email != email:
            raise HTTPException(401, "Email verification expired. Resend code.")
        if not body.password or len(body.password) < 6:
            raise HTTPException(400, "Password must be at least 6 characters")
        if await db.users.find_one({"email": email}):
            raise HTTPException(400, "Email already registered")
        uid = str(uuid.uuid4())
        user = {
            "id": uid,
            "email": email,
            "username": username,
            "password": hash_pwd(body.password),
            "first_name": body.first_name.strip(),
            "age": body.age,
            "gender": None,
            "interested_in": None,
            "bio": "",
            "interests": [],
            "photos": [],
            "is_admin": False,
            "is_hidden": False,
            "blocked_users": [],
            "auth_provider": "email",
            "email_verified": True,
            "created_at": utcnow(),
        }
        await db.users.insert_one(user.copy())
        token = make_token(uid)
        return {"token": token, "user": clean_user(user)}

    # phone signup
    phone = body.identifier.strip()
    cli = get_twilio()
    sid = await ensure_verify_service()
    if not cli or not sid:
        raise HTTPException(503, "Phone auth unavailable")
    if not body.code:
        raise HTTPException(400, "Verify your phone first")
    try:
        check = await asyncio.to_thread(
            lambda: cli.verify.v2.services(sid).verification_checks.create(to=phone, code=body.code)
        )
    except Exception as e:
        raise HTTPException(400, f"Verification failed: {e}")
    if check.status != "approved":
        raise HTTPException(401, "Invalid code")
    if await db.users.find_one({"phone": phone}):
        raise HTTPException(400, "Phone already registered")
    uid = str(uuid.uuid4())
    user = {
        "id": uid,
        "email": f"{phone}@phone.bump.app",
        "phone": phone,
        "username": username,
        "password": hash_pwd(_secrets.token_urlsafe(24)),
        "first_name": body.first_name.strip(),
        "age": body.age,
        "gender": None,
        "interested_in": None,
        "bio": "",
        "interests": [],
        "photos": [],
        "is_admin": False,
        "is_hidden": False,
        "blocked_users": [],
        "auth_provider": "phone",
        "phone_verified": True,
        "created_at": utcnow(),
    }
    await db.users.insert_one(user.copy())
    token = make_token(uid)
    return {"token": token, "user": clean_user(user)}


@router.post("/auth/login-unified")
async def unified_login(body: UnifiedLoginIn):
    kind = detect_identifier_type(body.identifier)
    if not kind:
        raise HTTPException(400, "Invalid identifier")
    user = await find_user_by_identifier(body.identifier)
    if not user:
        raise HTTPException(404, "Account not found")
    if kind == "phone":
        cli = get_twilio()
        sid = await ensure_verify_service()
        if not cli or not sid:
            raise HTTPException(503, "Phone auth unavailable")
        if not body.code:
            raise HTTPException(400, "Provide the SMS code")
        try:
            check = await asyncio.to_thread(
                lambda: cli.verify.v2.services(sid).verification_checks.create(to=user["phone"], code=body.code)
            )
        except Exception as e:
            raise HTTPException(400, f"Verification failed: {e}")
        if check.status != "approved":
            raise HTTPException(401, "Invalid code")
        token = make_token(user["id"])
        return {"token": token, "user": clean_user(user)}
    if not body.password:
        raise HTTPException(400, "Password required")
    if not check_pwd(body.password, user["password"]):
        raise HTTPException(401, "Wrong password")
    token = make_token(user["id"])
    return {"token": token, "user": clean_user(user)}


@router.post("/auth/forgot")
async def forgot_password(body: ResetRequestIn):
    kind = detect_identifier_type(body.identifier)
    if not kind:
        raise HTTPException(400, "Invalid identifier")
    user = await find_user_by_identifier(body.identifier)
    if not user:
        return {"sent": True, "channel": "email" if kind == "email" else "phone"}
    if kind == "phone":
        cli = get_twilio()
        sid = await ensure_verify_service()
        if not cli or not sid:
            raise HTTPException(503, "Phone auth unavailable")
        try:
            await asyncio.to_thread(
                lambda: cli.verify.v2.services(sid).verifications.create(to=user["phone"], channel="sms")
            )
        except Exception as e:
            logger.error(f"Forgot phone send err: {e}")
            raise HTTPException(400, "Could not send SMS")
        return {"sent": True, "channel": "phone"}
    target_email = user.get("email")
    if not target_email or target_email.endswith("@phone.bump.app"):
        raise HTTPException(400, "No email on file. Use forgot password via phone.")
    token = _secrets.token_urlsafe(32)
    await db.reset_tokens.insert_one({
        "token": token,
        "user_id": user["id"],
        "expires_at": utcnow() + timedelta(minutes=30),
        "used": False,
        "created_at": utcnow(),
    })
    sent = await send_email_reset_link(target_email, token)
    resp = {"sent": True, "channel": "email"}
    if not sent and demo_mode():
        resp["dev_token"] = token
    return resp


@router.post("/auth/reset")
async def confirm_reset(body: ResetConfirmIn):
    if body.token:
        rec = await db.reset_tokens.find_one({"token": body.token})
        if not rec or rec.get("used"):
            raise HTTPException(401, "Invalid or used reset link")
        exp = ensure_aware(rec.get("expires_at"))
        if not exp or exp < utcnow():
            raise HTTPException(401, "Reset link expired")
        await db.users.update_one({"id": rec["user_id"]}, {"$set": {"password": hash_pwd(body.new_password)}})
        await db.reset_tokens.update_one({"token": body.token}, {"$set": {"used": True, "used_at": utcnow()}})
        u = await db.users.find_one({"id": rec["user_id"]}, {"_id": 0, "password": 0})
        token = make_token(rec["user_id"])
        return {"token": token, "user": u}
    if not body.identifier or not body.code:
        raise HTTPException(400, "Missing identifier or code")
    kind = detect_identifier_type(body.identifier)
    if kind != "phone":
        raise HTTPException(400, "Phone OTP reset requires phone identifier")
    user = await find_user_by_identifier(body.identifier)
    if not user:
        raise HTTPException(404, "Account not found")
    cli = get_twilio()
    sid = await ensure_verify_service()
    if not cli or not sid:
        raise HTTPException(503, "Phone auth unavailable")
    try:
        check = await asyncio.to_thread(
            lambda: cli.verify.v2.services(sid).verification_checks.create(to=user["phone"], code=body.code)
        )
    except Exception as e:
        raise HTTPException(400, f"Verification failed: {e}")
    if check.status != "approved":
        raise HTTPException(401, "Invalid code")
    await db.users.update_one({"id": user["id"]}, {"$set": {"password": hash_pwd(body.new_password)}})
    token = make_token(user["id"])
    u = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password": 0})
    return {"token": token, "user": u}


# -------- legacy phone OTP (one-shot signup+login) --------
@router.post("/auth/phone/send")
async def phone_send(body: PhoneSendIn):
    cli = get_twilio()
    sid = await ensure_verify_service()
    if not cli or not sid:
        raise HTTPException(503, "Phone auth unavailable")
    try:
        await asyncio.to_thread(
            lambda: cli.verify.v2.services(sid).verifications.create(to=body.phone, channel="sms")
        )
        return {"sent": True}
    except Exception as e:
        logger.error(f"Phone send err: {e}")
        raise HTTPException(400, str(e))


@router.post("/auth/phone/verify")
async def phone_verify(body: PhoneVerifyIn):
    cli = get_twilio()
    sid = await ensure_verify_service()
    if not cli or not sid:
        raise HTTPException(503, "Phone auth unavailable")
    try:
        check = await asyncio.to_thread(
            lambda: cli.verify.v2.services(sid).verification_checks.create(to=body.phone, code=body.code)
        )
    except Exception as e:
        raise HTTPException(400, f"Verification failed: {e}")
    if check.status != "approved":
        raise HTTPException(401, "Invalid code")
    user = await db.users.find_one({"phone": body.phone})
    if not user:
        uid = str(uuid.uuid4())
        user = {
            "id": uid,
            "email": f"{body.phone}@phone.bump.app",
            "phone": body.phone,
            "password": hash_pwd(str(uuid.uuid4())),
            "first_name": body.first_name or "Friend",
            "age": body.age or 21,
            "gender": None,
            "interested_in": None,
            "bio": "",
            "interests": [],
            "photos": [],
            "is_admin": False,
            "is_hidden": False,
            "blocked_users": [],
            "auth_provider": "phone",
            "created_at": utcnow(),
        }
        await db.users.insert_one(user.copy())
    token = make_token(user["id"])
    return {"token": token, "user": clean_user(user)}


# -------- legacy Emergent Google session --------
@router.post("/auth/google/session")
async def google_session(body: GoogleSessionIn):
    try:
        async with httpx.AsyncClient(timeout=10.0) as cli:
            r = await cli.get(EMERGENT_AUTH_API, headers={"X-Session-ID": body.session_id})
        if r.status_code != 200:
            raise HTTPException(401, "Invalid Google session")
        data = r.json()
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Emergent auth err: {e}")
        raise HTTPException(503, "Auth service unavailable")
    email = (data.get("email") or "").lower()
    name = data.get("name") or "Friend"
    picture = data.get("picture") or ""
    if not email:
        raise HTTPException(400, "No email returned")
    user = await db.users.find_one({"email": email})
    if not user:
        uid = str(uuid.uuid4())
        first_name = name.split(" ")[0] if name else "Friend"
        user = {
            "id": uid,
            "email": email,
            "password": hash_pwd(str(uuid.uuid4())),
            "first_name": first_name,
            "age": 21,
            "gender": None,
            "interested_in": None,
            "bio": "",
            "interests": [],
            "photos": [picture] if picture else [],
            "created_at": utcnow(),
        }
        await db.users.insert_one(user.copy())
    token = make_token(user["id"])
    return {"token": token, "user": clean_user(user)}
