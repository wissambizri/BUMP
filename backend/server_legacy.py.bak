"""BUMP - Proximity-based nightlife matching app backend."""
import os
import uuid
import math
import logging
import asyncio
import json
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import List, Optional, Dict, Any

import jwt
import bcrypt
import requests
import random
import httpx
from fastapi import FastAPI, APIRouter, Depends, HTTPException, status, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr
try:
    from twilio.rest import Client as TwilioClient
except ImportError:
    TwilioClient = None
try:
    import resend
except ImportError:
    resend = None
try:
    from exponent_server_sdk import PushClient, PushMessage  # type: ignore
except ImportError:
    PushClient = None
    PushMessage = None
import re as _re
import secrets as _secrets


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# -------------------- CONFIG --------------------
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
SECRET_KEY = os.environ.get("JWT_SECRET", "bump-super-secret-dev-key-change-in-prod-2026")
GOOGLE_API_KEY = os.environ.get("GOOGLE_PLACES_API_KEY", "")
TWILIO_SID = os.environ.get("TWILIO_ACCOUNT_SID", "")
TWILIO_TOKEN = os.environ.get("TWILIO_AUTH_TOKEN", "")
TWILIO_VERIFY_SID = os.environ.get("TWILIO_VERIFY_SERVICE_SID", "")  # auto-created if blank
RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
RESEND_FROM_EMAIL = os.environ.get("RESEND_FROM_EMAIL", "onboarding@resend.dev")
APP_DEEPLINK_SCHEME = os.environ.get("APP_DEEPLINK_SCHEME", "bump")
EMERGENT_AUTH_API = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"
ALGORITHM = "HS256"
TOKEN_EXPIRE_HOURS = 24 * 30  # 30 days for mobile

if resend and RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY
SELFIE_EXPIRE_HOURS = 6
CHAT_EXPIRE_HOURS = 24
PLACES_RADIUS_M = 2000  # 2km search radius
PLACES_CACHE_TTL_SECONDS = 3600  # 1 hour cache per grid cell

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("bump")

app = FastAPI(title="BUMP API")
api = APIRouter(prefix="/api")
bearer = HTTPBearer(auto_error=False)


# -------------------- GOOGLE PLACES (New API v1) --------------------
PLACES_NEARBY_URL = "https://places.googleapis.com/v1/places:searchNearby"
PLACES_PHOTO_BASE = "https://places.googleapis.com/v1"
# New API uses these "primary type" tags. Mix nightlife + restaurants per user choice (c).
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


def _vibe_from_types(primary: Optional[str], types: List[str]) -> str:
    p = (primary or "").lower()
    t = [(x or "").lower() for x in (types or [])]
    # Priority: nightclub > cocktail > wine > bar > rooftop/lounge > live music > fine dining > restaurant
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


def _kind_from_types(primary: Optional[str], types: List[str]) -> str:
    """Pick the *most nightlife-y* tag as the primary kind.
    Priority order (strict): Nightclub > Lounge > Cocktail Bar > Wine Bar > Pub > Bar > Live Music > Fine Dining > Restaurant.
    primaryType (when set by Google) wins over the secondary types array.
    """
    p = (primary or "").lower()
    t = set((x or "").lower() for x in (types or []))
    name_hint = ""  # set by caller for lounge detection from name
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
    # First check primaryType
    for key, label in PRIORITY:
        if p == key:
            return label
    # Then walk types in priority order so the most nightlife-y wins
    for key, label in PRIORITY:
        if key in t:
            return label
    return "Venue"


# Sort rank for kind — lower = appears first in venue list
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


def _kind_rank(kind: Optional[str]) -> int:
    return KIND_RANK.get(kind or "Venue", 9)


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
    """Call Google Places Nearby Search (New API) for nightlife venues."""
    all_results: List[Dict[str, Any]] = []
    # First: pure nightlife
    all_results.extend(_call_places_nearby(lat, lng, NIGHTLIFE_TYPES))
    # Second: restaurants (per user spec)
    all_results.extend(_call_places_nearby(lat, lng, RESTAURANT_TYPES))
    # Dedupe by id
    seen = set()
    unique = []
    for p in all_results:
        pid = p.get("id")
        if pid and pid not in seen:
            seen.add(pid)
            unique.append(p)
    return unique


async def upsert_google_venues(lat: float, lng: float) -> int:
    """Fetch nearby Google venues and upsert into MongoDB. Returns count added."""
    if not GOOGLE_API_KEY or (lat == 0 and lng == 0):
        return 0
    cell = f"{round(lat, 2)},{round(lng, 2)}"
    cache = await db.places_cache.find_one({"cell": cell})
    now = utcnow()
    if cache:
        cu = cache["updated_at"]
        if cu.tzinfo is None:
            cu = cu.replace(tzinfo=timezone.utc)
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
        photo_name = None
        photos = p.get("photos") or []
        if photos:
            # New API photo name format: "places/PLACE_ID/photos/PHOTO_ID"
            photo_name = photos[0].get("name")
        display = (p.get("displayName") or {}).get("text") or "Unknown venue"
        types = p.get("types") or []
        primary = p.get("primaryType")
        addr = p.get("shortFormattedAddress") or p.get("formattedAddress") or ""
        city = addr.split(",")[-2].strip() if addr.count(",") >= 1 else (addr.split(",")[-1].strip() or "Nearby")
        # Encode photo name in proxy URL (URL-safe base64 to preserve "/")
        import base64
        photo_token = base64.urlsafe_b64encode(photo_name.encode()).decode() if photo_name else None
        doc = {
            "name": display,
            "kind": _kind_from_types(primary, types),
            "vibe": _vibe_from_types(primary, types),
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
                {"place_id": pid},
                {"$set": {**doc, "updated_at": now}},
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
        if os.environ.get("DEMO_MODE", "1") == "1":
            await populate_demo_checkins(lat, lng)
    return added


async def populate_demo_checkins(lat: float, lng: float):
    """Check demo users into nearby venues for demo realism."""
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


# -------------------- HELPERS --------------------
def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def ensure_aware(dt: Optional[datetime]) -> Optional[datetime]:
    """MongoDB returns naive UTC datetimes; normalize to aware."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def iso(dt: Optional[datetime]) -> Optional[str]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


def hash_pwd(pwd: str) -> str:
    return bcrypt.hashpw(pwd.encode(), bcrypt.gensalt()).decode()


def check_pwd(pwd: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pwd.encode(), hashed.encode())
    except Exception:
        return False


def make_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": utcnow() + timedelta(hours=TOKEN_EXPIRE_HOURS),
        "iat": utcnow(),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Distance in meters between two GPS points."""
    R = 6371000
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


async def get_user(credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer)) -> Dict[str, Any]:
    if credentials is None:
        raise HTTPException(401, "Missing token")
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
    except jwt.PyJWTError:
        raise HTTPException(401, "Invalid token")
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "password": 0})
    if not user:
        raise HTTPException(401, "User not found")
    return user


async def get_admin(user: Dict[str, Any] = Depends(get_user)) -> Dict[str, Any]:
    if not user.get("is_admin"):
        raise HTTPException(403, "Admin only")
    return user


def clean_user(u: Dict[str, Any]) -> Dict[str, Any]:
    """Strip sensitive fields and _id from user."""
    if not u:
        return {}
    u.pop("_id", None)
    u.pop("password", None)
    return u


# -------------------- MODELS --------------------
class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    first_name: str
    age: int = Field(ge=18, le=99)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class ProfileIn(BaseModel):
    first_name: Optional[str] = None
    age: Optional[int] = Field(default=None, ge=18, le=99)
    gender: Optional[str] = None
    interested_in: Optional[str] = None
    bio: Optional[str] = None
    interests: Optional[List[str]] = None
    photos: Optional[List[str]] = None  # base64 or URL
    horoscope: Optional[str] = None  # one of HOROSCOPE_SIGNS
    hide_age: Optional[bool] = None  # if True, age is hidden on public profile
    birthday: Optional[str] = None  # ISO YYYY-MM-DD; if provided, horoscope is auto-derived


class CheckinIn(BaseModel):
    venue_id: str
    lat: float
    lng: float
    selfie_base64: str


class LikeIn(BaseModel):
    target_user_id: str
    action: str  # like, hi, pass


class MessageIn(BaseModel):
    match_id: str
    text: str


class ReportIn(BaseModel):
    target_user_id: str
    reason: str  # category code: spam, harassment, inappropriate_photo, fake_profile, underage, violence, other
    details: Optional[str] = None


REPORT_CATEGORIES = {
    "spam": "Spam or scam",
    "harassment": "Harassment or hate",
    "inappropriate_photo": "Inappropriate photos",
    "fake_profile": "Fake profile",
    "underage": "Underage user",
    "violence": "Violence or threats",
    "other": "Something else",
}
AUTO_HIDE_THRESHOLD = 3  # auto-hide after this many open reports

# Zodiac signs (date ranges in month-day pairs)
HOROSCOPE_SIGNS = [
    "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
    "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces",
]
HOROSCOPE_EMOJI = {
    "Aries": "♈", "Taurus": "♉", "Gemini": "♊", "Cancer": "♋",
    "Leo": "♌", "Virgo": "♍", "Libra": "♎", "Scorpio": "♏",
    "Sagittarius": "♐", "Capricorn": "♑", "Aquarius": "♒", "Pisces": "♓",
}


def horoscope_from_birthday(iso_date: str) -> Optional[str]:
    """Derive zodiac from ISO YYYY-MM-DD birthday."""
    try:
        m, d = int(iso_date[5:7]), int(iso_date[8:10])
    except Exception:
        return None
    ranges = [
        ("Capricorn", (12, 22), (1, 19)),
        ("Aquarius", (1, 20), (2, 18)),
        ("Pisces", (2, 19), (3, 20)),
        ("Aries", (3, 21), (4, 19)),
        ("Taurus", (4, 20), (5, 20)),
        ("Gemini", (5, 21), (6, 20)),
        ("Cancer", (6, 21), (7, 22)),
        ("Leo", (7, 23), (8, 22)),
        ("Virgo", (8, 23), (9, 22)),
        ("Libra", (9, 23), (10, 22)),
        ("Scorpio", (10, 23), (11, 21)),
        ("Sagittarius", (11, 22), (12, 21)),
    ]
    md = (m, d)
    for sign, start, end in ranges:
        if sign == "Capricorn":
            if md >= start or md <= end:
                return sign
        elif start <= md <= end:
            return sign
    return None


class KeepIn(BaseModel):
    match_id: str


# -------------------- AUTH --------------------
@api.post("/auth/register")
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


@api.post("/auth/login")
async def login(body: LoginIn):
    user = await db.users.find_one({"email": body.email.lower()})
    if not user or not check_pwd(body.password, user["password"]):
        raise HTTPException(401, "Invalid credentials")
    token = make_token(user["id"])
    return {"token": token, "user": clean_user(user)}


@api.get("/auth/me")
async def me(user: Dict = Depends(get_user)):
    return user


# -------------------- UNIFIED AUTH (username | email | phone) --------------------
USERNAME_RE = _re.compile(r"^[a-zA-Z0-9_]{3,20}$")
EMAIL_RE = _re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
PHONE_RE = _re.compile(r"^\+\d{8,16}$")


def detect_identifier_type(identifier: str) -> Optional[str]:
    s = (identifier or "").strip()
    if not s:
        return None
    if PHONE_RE.match(s):
        return "phone"
    if "@" in s and EMAIL_RE.match(s):
        return "email"
    if USERNAME_RE.match(s):
        return "username"
    return None


def normalize_identifier(identifier: str, kind: str) -> str:
    s = (identifier or "").strip()
    if kind == "email" or kind == "username":
        return s.lower()
    return s


async def find_user_by_identifier(identifier: str) -> Optional[Dict[str, Any]]:
    kind = detect_identifier_type(identifier)
    if not kind:
        return None
    v = normalize_identifier(identifier, kind)
    if kind == "email":
        return await db.users.find_one({"email": v})
    if kind == "phone":
        return await db.users.find_one({"phone": v})
    if kind == "username":
        return await db.users.find_one({"username": v})
    return None


def gen_otp_code() -> str:
    return "".join([str(_secrets.randbelow(10)) for _ in range(6)])


def hash_otp(code: str) -> str:
    return bcrypt.hashpw(code.encode(), bcrypt.gensalt(rounds=8)).decode()


def check_otp(code: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(code.encode(), hashed.encode())
    except Exception:
        return False


async def send_email_otp(email: str, code: str, purpose: str) -> bool:
    """Send 6-digit OTP via Resend. Returns True if sent."""
    if not resend or not RESEND_API_KEY:
        logger.warning(f"Resend not configured — OTP for {email}: {code}")
        return False
    try:
        subject = {
            "signup": "Verify your BUMP account",
            "login": "Your BUMP login code",
            "reset": "Reset your BUMP password",
        }.get(purpose, "Your BUMP code")
        html = f"""
        <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #0a0a0f; color: #f5f5f7; border-radius: 16px;">
          <h1 style="color: #c5ff00; font-size: 28px; letter-spacing: -1px; margin: 0 0 8px;">BUMP</h1>
          <p style="color: #a1a1aa; font-size: 13px; letter-spacing: 2px; text-transform: uppercase; margin: 0 0 24px;">Break the ice nearby.</p>
          <h2 style="color: #f5f5f7; font-size: 22px; margin: 0 0 12px;">{subject}</h2>
          <p style="color: #a1a1aa; font-size: 15px; line-height: 1.5; margin: 0 0 24px;">Use this code to {purpose}. It expires in 10 minutes.</p>
          <div style="background: #1c1c22; border: 1px solid #2a2a32; border-radius: 12px; padding: 24px; text-align: center;">
            <div style="color: #c5ff00; font-size: 36px; font-weight: 900; letter-spacing: 8px; font-family: 'SF Mono', Menlo, monospace;">{code}</div>
          </div>
          <p style="color: #71717a; font-size: 12px; margin: 24px 0 0;">If you didn't request this, you can safely ignore this email.</p>
        </div>
        """
        await asyncio.to_thread(
            lambda: resend.Emails.send({
                "from": f"BUMP <{RESEND_FROM_EMAIL}>",
                "to": [email],
                "subject": f"{code} — {subject}",
                "html": html,
            })
        )
        return True
    except Exception as e:
        logger.error(f"Resend send err: {e}")
        return False


async def send_email_reset_link(email: str, token: str) -> bool:
    if not resend or not RESEND_API_KEY:
        logger.warning(f"Resend not configured — Reset link for {email}: {token}")
        return False
    try:
        link = f"{APP_DEEPLINK_SCHEME}://reset?token={token}"
        html = f"""
        <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #0a0a0f; color: #f5f5f7; border-radius: 16px;">
          <h1 style="color: #c5ff00; font-size: 28px; letter-spacing: -1px; margin: 0 0 8px;">BUMP</h1>
          <h2 style="color: #f5f5f7; font-size: 22px; margin: 16px 0 12px;">Reset your password</h2>
          <p style="color: #a1a1aa; font-size: 15px; line-height: 1.5; margin: 0 0 24px;">Tap the button below to choose a new password. This link expires in 30 minutes.</p>
          <a href="{link}" style="display: inline-block; background: #c5ff00; color: #0a0a0f; padding: 14px 28px; border-radius: 999px; font-weight: 800; text-decoration: none;">Reset password</a>
          <p style="color: #71717a; font-size: 12px; margin: 24px 0 8px;">Or copy this token into the app: <strong style="color: #f5f5f7;">{token}</strong></p>
          <p style="color: #71717a; font-size: 12px; margin: 16px 0 0;">If you didn't request this, you can safely ignore this email.</p>
        </div>
        """
        await asyncio.to_thread(
            lambda: resend.Emails.send({
                "from": f"BUMP <{RESEND_FROM_EMAIL}>",
                "to": [email],
                "subject": "Reset your BUMP password",
                "html": html,
            })
        )
        return True
    except Exception as e:
        logger.error(f"Resend reset err: {e}")
        return False


# ----- Models -----
class IdentifierIn(BaseModel):
    identifier: str


class UnifiedLoginIn(BaseModel):
    identifier: str
    password: Optional[str] = None
    code: Optional[str] = None


class UnifiedSignupIn(BaseModel):
    identifier: str  # email or phone
    code: Optional[str] = None  # OTP from email or phone verification
    username: Optional[str] = None
    password: Optional[str] = None  # required for email signup
    first_name: str
    age: int = Field(ge=18, le=99)


class EmailOtpSendIn(BaseModel):
    email: EmailStr
    purpose: str = "signup"  # signup | login | reset


class EmailOtpVerifyIn(BaseModel):
    email: EmailStr
    code: str
    purpose: str = "signup"


class ResetRequestIn(BaseModel):
    identifier: str  # email or phone


class ResetConfirmIn(BaseModel):
    token: Optional[str] = None  # for email-link reset
    identifier: Optional[str] = None  # for phone-otp reset
    code: Optional[str] = None  # for phone-otp reset
    new_password: str = Field(min_length=6)


class UsernameCheckIn(BaseModel):
    username: str


class AccountEmailIn(BaseModel):
    email: Optional[EmailStr] = None  # if None, uses user's existing email


class AccountEmailConfirmIn(BaseModel):
    code: str
    email: Optional[EmailStr] = None


class AccountPhoneIn(BaseModel):
    phone: Optional[str] = None


class AccountPhoneConfirmIn(BaseModel):
    code: str
    phone: Optional[str] = None


@api.post("/account/email/send")
async def account_email_send(body: AccountEmailIn, user: Dict = Depends(get_user)):
    """Send verification OTP for adding or verifying user's email."""
    target_email = (body.email or user.get("email") or "").lower()
    if not target_email or target_email.endswith("@phone.bump.app"):
        raise HTTPException(400, "No email on file. Provide one to verify.")
    if "@" not in target_email or "." not in target_email:
        raise HTTPException(400, "Invalid email")
    # If new email differs from current, check uniqueness
    current = (user.get("email") or "").lower()
    if target_email != current:
        if await db.users.find_one({"email": target_email, "id": {"$ne": user["id"]}}):
            raise HTTPException(400, "Email already used by another account")
    # rate-limit
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
    resp = {"sent": True}
    if os.environ.get("DEMO_MODE", "1") == "1" and not sent:
        resp["dev_code"] = code
    return resp


@api.post("/account/email/confirm")
async def account_email_confirm(body: AccountEmailConfirmIn, user: Dict = Depends(get_user)):
    target_email = (body.email or user.get("email") or "").lower()
    ok = await _consume_email_otp(target_email, body.code, "account")
    if not ok:
        raise HTTPException(401, "Invalid or expired code")
    update: Dict[str, Any] = {"email": target_email, "email_verified": True, "updated_at": utcnow()}
    await db.users.update_one({"id": user["id"]}, {"$set": update})
    u = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password": 0})
    return {"verified": True, "user": u}


@api.post("/account/phone/send")
async def account_phone_send(body: AccountPhoneIn, user: Dict = Depends(get_user)):
    target_phone = (body.phone or user.get("phone") or "").strip()
    if not PHONE_RE.match(target_phone):
        raise HTTPException(400, "Provide a phone in +E.164 format (+14155550100)")
    # Uniqueness check if changing
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
    # Stash pending phone so confirm knows what to save
    await db.users.update_one(
        {"id": user["id"]}, {"$set": {"pending_phone": target_phone}}
    )
    return {"sent": True}


@api.post("/account/phone/confirm")
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
        {"$set": {"phone": target_phone, "phone_verified": True, "updated_at": utcnow()},
         "$unset": {"pending_phone": ""}},
    )
    u = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password": 0})
    return {"verified": True, "user": u}


# ----- Endpoint: identifier resolution -----
@api.post("/auth/identify")
async def auth_identify(body: IdentifierIn):
    """Detects identifier type and tells the client what auth step to render."""
    kind = detect_identifier_type(body.identifier)
    if not kind:
        raise HTTPException(400, "Enter a valid email, phone (+1234567890), or username (3–20 letters/digits/_)")
    v = normalize_identifier(body.identifier, kind)
    user = await find_user_by_identifier(body.identifier)
    if user:
        # Existing user → login
        if kind == "phone":
            return {"kind": "phone", "exists": True, "next": "otp_phone"}
        # email or username → password login (with optional email otp fallback)
        return {"kind": kind, "exists": True, "next": "password", "has_email": bool(user.get("email") and not user["email"].endswith("@phone.bump.app"))}
    # New user → signup
    if kind == "username":
        raise HTTPException(404, "Username not found. Sign up with email or phone first.")
    if kind == "phone":
        return {"kind": "phone", "exists": False, "next": "otp_phone"}
    return {"kind": "email", "exists": False, "next": "otp_email"}


# ----- Endpoint: username availability -----
@api.post("/auth/username/check")
async def username_check(body: UsernameCheckIn):
    u = (body.username or "").strip().lower()
    if not USERNAME_RE.match(u):
        return {"available": False, "reason": "Must be 3–20 letters, digits, or underscore"}
    exists = await db.users.find_one({"username": u})
    if exists:
        return {"available": False, "reason": "Username taken"}
    return {"available": True}


# ----- Endpoint: email OTP send/verify -----
@api.post("/auth/email/send")
async def email_otp_send(body: EmailOtpSendIn):
    email = body.email.lower()
    if body.purpose not in ("signup", "login", "reset"):
        raise HTTPException(400, "Invalid purpose")
    # Rate limit: 1 per 30s per email/purpose
    recent = await db.email_otps.find_one({"email": email, "purpose": body.purpose})
    if recent:
        created = ensure_aware(recent.get("created_at"))
        if created and (utcnow() - created).total_seconds() < 30:
            raise HTTPException(429, "Please wait a moment before requesting another code")
    # For signup, email must NOT exist; for login/reset, email MUST exist
    user = await db.users.find_one({"email": email})
    if body.purpose == "signup" and user:
        raise HTTPException(400, "Email already registered. Try logging in.")
    if body.purpose in ("login", "reset") and not user:
        # Silent success to avoid email enumeration
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
    if not sent and os.environ.get("DEMO_MODE", "1") != "1":
        raise HTTPException(503, "Email service unavailable")
    resp = {"sent": True}
    if os.environ.get("DEMO_MODE", "1") == "1" and not sent:
        # Dev only fallback
        resp["dev_code"] = code
    return resp


async def _consume_email_otp(email: str, code: str, purpose: str) -> bool:
    rec = await db.email_otps.find_one({"email": email, "purpose": purpose})
    if not rec:
        return False
    exp = ensure_aware(rec.get("expires_at"))
    if not exp or exp < utcnow():
        await db.email_otps.delete_one({"email": email, "purpose": purpose})
        return False
    if rec.get("attempts", 0) >= 5:
        return False
    ok = check_otp(code, rec["code_hash"])
    if not ok:
        await db.email_otps.update_one(
            {"email": email, "purpose": purpose}, {"$inc": {"attempts": 1}}
        )
        return False
    await db.email_otps.delete_one({"email": email, "purpose": purpose})
    return True


@api.post("/auth/email/verify")
async def email_otp_verify(body: EmailOtpVerifyIn):
    """Verifies email OTP. For signup, returns a short-lived signup_token to use in /auth/signup."""
    email = body.email.lower()
    ok = await _consume_email_otp(email, body.code, body.purpose)
    if not ok:
        raise HTTPException(401, "Invalid or expired code")
    # Issue a signed claim that this email has been verified for this purpose
    payload = {
        "scope": f"verified_{body.purpose}",
        "email": email,
        "exp": utcnow() + timedelta(minutes=15),
    }
    token = jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)
    return {"verified": True, "scope_token": token}


def _consume_scope_token(token: str, purpose: str) -> Optional[str]:
    try:
        data = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.PyJWTError:
        return None
    if data.get("scope") != f"verified_{purpose}":
        return None
    return data.get("email")


# ----- Endpoint: unified signup -----
@api.post("/auth/signup")
async def unified_signup(body: UnifiedSignupIn):
    kind = detect_identifier_type(body.identifier)
    if kind not in ("email", "phone"):
        raise HTTPException(400, "Sign up with a valid email or phone number")
    if not body.first_name or len(body.first_name.strip()) < 1:
        raise HTTPException(400, "First name is required")
    # Optional username
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
        # body.code is the scope_token from /auth/email/verify
        verified_email = _consume_scope_token(body.code, "signup")
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
        "password": hash_pwd(_secrets.token_urlsafe(24)),  # random placeholder
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


# ----- Endpoint: unified login -----
@api.post("/auth/login-unified")
async def unified_login(body: UnifiedLoginIn):
    kind = detect_identifier_type(body.identifier)
    if not kind:
        raise HTTPException(400, "Invalid identifier")
    user = await find_user_by_identifier(body.identifier)
    if not user:
        raise HTTPException(404, "Account not found")
    # Phone login → OTP
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
    # email/username → password
    if not body.password:
        raise HTTPException(400, "Password required")
    if not check_pwd(body.password, user["password"]):
        raise HTTPException(401, "Wrong password")
    token = make_token(user["id"])
    return {"token": token, "user": clean_user(user)}


# ----- Endpoint: forgot password -----
@api.post("/auth/forgot")
async def forgot_password(body: ResetRequestIn):
    kind = detect_identifier_type(body.identifier)
    if not kind:
        raise HTTPException(400, "Invalid identifier")
    user = await find_user_by_identifier(body.identifier)
    # Silent success to avoid enumeration
    if not user:
        return {"sent": True, "channel": "email" if kind == "email" else "phone"}
    if kind == "phone":
        # Use Twilio Verify
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
    # email / username → send email reset link
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
    await send_email_reset_link(target_email, token)
    return {"sent": True, "channel": "email"}


# ----- Endpoint: confirm reset -----
@api.post("/auth/reset")
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
    # Phone OTP reset
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


# -------------------- PUSH NOTIFICATIONS (Expo) --------------------
_push_client = None


def get_push_client():
    global _push_client
    if _push_client is None and PushClient is not None:
        _push_client = PushClient()
    return _push_client


async def send_push(user_id: str, title: str, body: str, data: Optional[Dict[str, Any]] = None):
    """Send Expo push notification to all of a user's registered devices. Fire-and-forget."""
    if not PushClient or not PushMessage:
        return
    tokens = await db.push_tokens.find({"user_id": user_id}).to_list(20)
    if not tokens:
        return
    cli = get_push_client()
    if not cli:
        return
    msgs = []
    for t in tokens:
        tok = t.get("token")
        if not tok or not tok.startswith("ExponentPushToken"):
            continue
        msgs.append(
            PushMessage(
                to=tok,
                title=title,
                body=body,
                data=data or {},
                sound="default",
                priority="high",
            )
        )
    if not msgs:
        return
    try:
        await asyncio.to_thread(cli.publish_multiple, msgs)
    except Exception as e:
        logger.error(f"Push send err: {e}")


class PushRegisterIn(BaseModel):
    token: str
    platform: Optional[str] = None  # ios | android | web
    device_name: Optional[str] = None


@api.post("/push/register")
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


@api.delete("/push/register")
async def push_unregister(token: str, user: Dict = Depends(get_user)):
    await db.push_tokens.delete_one({"token": token, "user_id": user["id"]})
    return {"ok": True}


# -------------------- TWILIO PHONE OTP --------------------
class PhoneSendIn(BaseModel):
    phone: str  # E.164 format e.g. +14155551234


class PhoneVerifyIn(BaseModel):
    phone: str
    code: str
    first_name: Optional[str] = "Friend"
    age: Optional[int] = 21


_twilio_client = None
_twilio_verify_sid_cache: Optional[str] = None


def get_twilio():
    global _twilio_client
    if _twilio_client is None and TwilioClient and TWILIO_SID and TWILIO_TOKEN:
        try:
            _twilio_client = TwilioClient(TWILIO_SID, TWILIO_TOKEN)
        except Exception as e:
            logger.error(f"Twilio init err: {e}")
    return _twilio_client


async def ensure_verify_service() -> Optional[str]:
    """Return the Twilio Verify Service SID. Auto-create one named 'BUMP' if not set."""
    global _twilio_verify_sid_cache
    if _twilio_verify_sid_cache:
        return _twilio_verify_sid_cache
    if TWILIO_VERIFY_SID:
        _twilio_verify_sid_cache = TWILIO_VERIFY_SID
        return _twilio_verify_sid_cache
    # Check DB for previously-created service
    rec = await db.config.find_one({"key": "twilio_verify_sid"})
    if rec and rec.get("value"):
        _twilio_verify_sid_cache = rec["value"]
        return _twilio_verify_sid_cache
    # Create one
    cli = get_twilio()
    if not cli:
        return None
    try:
        svc = await asyncio.to_thread(lambda: cli.verify.v2.services.create(friendly_name="BUMP"))
        sid = svc.sid
        await db.config.update_one(
            {"key": "twilio_verify_sid"},
            {"$set": {"key": "twilio_verify_sid", "value": sid}},
            upsert=True,
        )
        _twilio_verify_sid_cache = sid
        logger.info(f"Auto-created Twilio Verify Service: {sid}")
        return sid
    except Exception as e:
        logger.error(f"Twilio Verify Service create failed: {e}")
        return None


@api.post("/auth/phone/send")
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


@api.post("/auth/phone/verify")
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
    # find or create user
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


# -------------------- EMERGENT GOOGLE OAUTH --------------------
class GoogleSessionIn(BaseModel):
    session_id: str  # Temporary token from Emergent redirect


@api.post("/auth/google/session")
async def google_session(body: GoogleSessionIn):
    """Exchange Emergent session_id for our BUMP JWT.
    Calls Emergent's session-data endpoint to resolve session_id -> user info.
    """
    try:
        async with httpx.AsyncClient(timeout=10.0) as cli:
            r = await cli.get(
                EMERGENT_AUTH_API,
                headers={"X-Session-ID": body.session_id},
            )
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
            "is_admin": False,
            "is_hidden": False,
            "blocked_users": [],
            "auth_provider": "google",
            "created_at": utcnow(),
        }
        await db.users.insert_one(user.copy())
    token = make_token(user["id"])
    return {"token": token, "user": clean_user(user)}


@api.get("/profile/horoscopes")
async def horoscope_options():
    return [{"sign": s, "emoji": HOROSCOPE_EMOJI[s]} for s in HOROSCOPE_SIGNS]


@api.put("/profile")
async def update_profile(body: ProfileIn, user: Dict = Depends(get_user)):
    updates = {k: v for k, v in body.dict().items() if v is not None}
    # Derive horoscope from birthday if provided
    if "birthday" in updates and "horoscope" not in updates:
        derived = horoscope_from_birthday(updates["birthday"])
        if derived:
            updates["horoscope"] = derived
    # Validate horoscope value if explicitly set
    if "horoscope" in updates and updates["horoscope"] and updates["horoscope"] not in HOROSCOPE_SIGNS:
        raise HTTPException(400, f"Invalid horoscope. Allowed: {', '.join(HOROSCOPE_SIGNS)}")
    if updates:
        updates["updated_at"] = utcnow()
        await db.users.update_one({"id": user["id"]}, {"$set": updates})
    updated = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password": 0})
    return updated


# -------------------- VENUES --------------------
@api.get("/venues")
async def list_venues(
    lat: float = 0,
    lng: float = 0,
    refresh: int = 0,
    kind: Optional[str] = None,  # filter to a single kind (Nightclub, Lounge, Bar, ...)
    user: Dict = Depends(get_user),
):
    # If refresh requested, drop the grid cache so Google is re-queried
    if refresh and (lat != 0 or lng != 0):
        cell = f"{round(lat, 2)},{round(lng, 2)}"
        await db.places_cache.delete_one({"cell": cell})
    # Discover new venues from Google Places if GPS provided
    if lat != 0 or lng != 0:
        try:
            await upsert_google_venues(lat, lng)
        except Exception as e:
            logger.error(f"Places upsert err: {e}")
    venues = await db.venues.find({}, {"_id": 0}).to_list(500)
    now = utcnow()
    out = []
    for v in venues:
        # Lounge heuristic: name contains "lounge" → upgrade kind
        if (v.get("kind") or "") in ("Bar", "Cocktail Bar", "Venue") and "lounge" in (v.get("name") or "").lower():
            v["kind"] = "Lounge"
        if kind and (v.get("kind") or "").lower() != kind.lower():
            continue
        v["distance_m"] = int(haversine_m(lat, lng, v["lat"], v["lng"])) if (lat or lng) else None
        # Only return venues within reasonable radius when GPS provided
        if (lat or lng) and v["distance_m"] is not None and v["distance_m"] > PLACES_RADIUS_M * 2:
            continue
        active = await db.checkins.count_documents({
            "venue_id": v["id"],
            "expires_at": {"$gt": now},
        })
        v["active_count"] = active
        v["kind_rank"] = _kind_rank(v.get("kind"))
        out.append(v)
    if lat or lng:
        # Sort by kind priority FIRST (clubs/lounges/bars first), then by distance
        out.sort(key=lambda x: (x.get("kind_rank", 9), x.get("distance_m") or 0))
    else:
        out.sort(key=lambda x: (x.get("kind_rank", 9), -(x.get("active_count") or 0)))
    return out


@api.get("/venues/photo/{photo_token}")
async def venue_photo(photo_token: str, maxwidth: int = 800):
    """Proxy Google Places (New API) photo so the API key is not exposed.
    photo_token is urlsafe-base64 of the place's photo `name` field
    (e.g., 'places/{place_id}/photos/{photo_id}').
    """
    if not GOOGLE_API_KEY:
        raise HTTPException(404, "Photo unavailable")
    try:
        import base64
        # decode token back to photo name; add padding if missing
        pad = "=" * (-len(photo_token) % 4)
        photo_name = base64.urlsafe_b64decode(photo_token + pad).decode()
    except Exception:
        raise HTTPException(400, "Invalid photo token")
    # New API: GET https://places.googleapis.com/v1/{photo_name}/media?maxWidthPx=...&key=...
    url = f"{PLACES_PHOTO_BASE}/{photo_name}/media"
    try:
        params = {
            "maxWidthPx": maxwidth,
            "key": GOOGLE_API_KEY,
        }
        r = await asyncio.to_thread(
            requests.get, url, params=params, stream=True, timeout=12, allow_redirects=True
        )
        if r.status_code != 200:
            logger.warning(f"Photo fetch {r.status_code}: {r.text[:120] if hasattr(r,'text') else ''}")
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


@api.get("/venues/{venue_id}")
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


# -------------------- CHECK-IN --------------------
@api.post("/checkin")
async def checkin(body: CheckinIn, user: Dict = Depends(get_user)):
    venue = await db.venues.find_one({"id": body.venue_id}, {"_id": 0})
    if not venue:
        raise HTTPException(404, "Venue not found")
    distance = haversine_m(body.lat, body.lng, venue["lat"], venue["lng"])
    if distance > venue.get("geofence_radius_m", 200):
        # Demo override: allow if user is admin or env DEMO_MODE
        if not user.get("is_admin") and os.environ.get("DEMO_MODE", "1") != "1":
            raise HTTPException(400, f"You need to be closer to this venue. {int(distance)}m away.")
    # remove old checkins for this user
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


@api.delete("/checkin")
async def leave_venue(user: Dict = Depends(get_user)):
    await db.checkins.delete_many({"user_id": user["id"]})
    return {"ok": True}


@api.get("/checkin/active")
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


@api.get("/venues/{venue_id}/feed")
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
            {"id": ci["user_id"], "is_hidden": {"$ne": True}}, {"_id": 0, "password": 0, "email": 0}
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


# -------------------- LIKES & MATCHES --------------------
@api.post("/likes")
async def like(body: LikeIn, user: Dict = Depends(get_user)):
    if body.action not in ("like", "hi", "pass"):
        raise HTTPException(400, "Invalid action")
    if body.target_user_id == user["id"]:
        raise HTTPException(400, "Cannot like yourself")
    # store like
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
    # check mutual
    other = await db.likes.find_one({
        "from_user": body.target_user_id,
        "to_user": user["id"],
        "action": {"$in": ["like", "hi"]},
    })
    if not other:
        return {"matched": False}
    # create match
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
    # Send push notifications to both users
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


@api.get("/matches")
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


@api.post("/matches/keep")
async def keep_match(body: KeepIn, user: Dict = Depends(get_user)):
    m = await db.matches.find_one({"id": body.match_id})
    if not m or user["id"] not in (m["user_a"], m["user_b"]):
        raise HTTPException(404, "Match not found")
    await db.matches.update_one(
        {"id": body.match_id}, {"$addToSet": {"kept_by": user["id"]}}
    )
    return {"ok": True}


# -------------------- MESSAGES --------------------
@api.get("/messages/{match_id}")
async def get_messages(match_id: str, user: Dict = Depends(get_user)):
    m = await db.matches.find_one({"id": match_id})
    if not m or user["id"] not in (m["user_a"], m["user_b"]):
        raise HTTPException(404, "Match not found")
    msgs = await db.messages.find({"match_id": match_id}, {"_id": 0}).sort("created_at", 1).to_list(1000)
    # mark as read
    await db.messages.update_many(
        {"match_id": match_id, "to_user": user["id"], "read": False},
        {"$set": {"read": True, "read_at": utcnow()}},
    )
    for msg in msgs:
        msg["created_at"] = iso(msg["created_at"])
        if msg.get("read_at"):
            msg["read_at"] = iso(msg["read_at"])
    return msgs


@api.post("/messages")
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
    # broadcast
    await ws_manager.broadcast(body.match_id, {"type": "message", "message": msg})
    # push notify recipient
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


# -------------------- SAFETY --------------------
@api.get("/safety/report-categories")
async def safety_categories():
    return [{"code": k, "label": v} for k, v in REPORT_CATEGORIES.items()]


@api.get("/safety/blocked")
async def list_blocked(user: Dict = Depends(get_user)):
    """Return profile summaries for everyone the current user has blocked."""
    ids = user.get("blocked_users", []) or []
    if not ids:
        return []
    cursor = db.users.find(
        {"id": {"$in": ids}},
        {"_id": 0, "id": 1, "first_name": 1, "username": 1, "photos": 1, "age": 1},
    )
    return await cursor.to_list(100)


@api.post("/safety/block/{target_id}")
async def block_user(target_id: str, user: Dict = Depends(get_user)):
    if target_id == user["id"]:
        raise HTTPException(400, "You can't block yourself")
    target = await db.users.find_one({"id": target_id}, {"_id": 0, "id": 1})
    if not target:
        raise HTTPException(404, "User not found")
    await db.users.update_one(
        {"id": user["id"]}, {"$addToSet": {"blocked_users": target_id}}
    )
    # Best-effort: remove existing matches / likes between the two
    await db.matches.delete_many(
        {
            "$or": [
                {"user_a": user["id"], "user_b": target_id},
                {"user_a": target_id, "user_b": user["id"]},
            ]
        }
    )
    await db.likes.delete_many(
        {
            "$or": [
                {"from_user": user["id"], "to_user": target_id},
                {"from_user": target_id, "to_user": user["id"]},
            ]
        }
    )
    return {"ok": True}


@api.post("/safety/unblock/{target_id}")
async def unblock_user(target_id: str, user: Dict = Depends(get_user)):
    await db.users.update_one(
        {"id": user["id"]}, {"$pull": {"blocked_users": target_id}}
    )
    return {"ok": True}


@api.post("/safety/report")
async def report_user(body: ReportIn, user: Dict = Depends(get_user)):
    if body.target_user_id == user["id"]:
        raise HTTPException(400, "You can't report yourself")
    if body.reason not in REPORT_CATEGORIES:
        raise HTTPException(400, "Invalid reason code")
    target = await db.users.find_one({"id": body.target_user_id}, {"_id": 0, "id": 1})
    if not target:
        raise HTTPException(404, "User not found")
    # Prevent duplicate open reports from same reporter
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
    # Auto-hide on threshold
    open_count = await db.reports.count_documents(
        {"target_user": body.target_user_id, "status": "open"}
    )
    if open_count >= AUTO_HIDE_THRESHOLD:
        await db.users.update_one(
            {"id": body.target_user_id},
            {"$set": {"is_hidden": True, "auto_hidden_at": utcnow(), "auto_hidden_reports": open_count}},
        )
        logger.warning(
            f"Auto-hid user {body.target_user_id} after {open_count} open reports"
        )
    # Auto-block the reported user from the reporter
    await db.users.update_one(
        {"id": user["id"]}, {"$addToSet": {"blocked_users": body.target_user_id}}
    )
    return {"ok": True, "report_id": rec["id"]}


@api.post("/safety/hide")
async def toggle_hide(hidden: bool = True, user: Dict = Depends(get_user)):
    await db.users.update_one({"id": user["id"]}, {"$set": {"is_hidden": hidden}})
    return {"ok": True, "hidden": hidden}


@api.delete("/account")
async def delete_account(user: Dict = Depends(get_user)):
    uid = user["id"]
    await db.users.delete_one({"id": uid})
    await db.checkins.delete_many({"user_id": uid})
    await db.likes.delete_many({"$or": [{"from_user": uid}, {"to_user": uid}]})
    await db.matches.delete_many({"$or": [{"user_a": uid}, {"user_b": uid}]})
    await db.messages.delete_many({"$or": [{"from_user": uid}, {"to_user": uid}]})
    return {"ok": True}


# -------------------- ADMIN --------------------
@api.get("/admin/analytics")
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


@api.get("/admin/users")
async def admin_users(admin: Dict = Depends(get_admin)):
    users = await db.users.find({}, {"_id": 0, "password": 0}).to_list(500)
    return users


@api.get("/admin/reports")
async def admin_reports(admin: Dict = Depends(get_admin)):
    reports = await db.reports.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    for r in reports:
        r["created_at"] = iso(r["created_at"])
    return reports


@api.post("/admin/reports/{report_id}/resolve")
async def admin_resolve(report_id: str, admin: Dict = Depends(get_admin)):
    await db.reports.update_one({"id": report_id}, {"$set": {"status": "resolved"}})
    return {"ok": True}


@api.post("/admin/users/{user_id}/suspend")
async def admin_suspend(user_id: str, admin: Dict = Depends(get_admin)):
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"is_hidden": True, "is_suspended": True, "suspended_at": utcnow()}},
    )
    return {"ok": True}


@api.post("/admin/users/{user_id}/unsuspend")
async def admin_unsuspend(user_id: str, admin: Dict = Depends(get_admin)):
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"is_hidden": False, "is_suspended": False}, "$unset": {"suspended_at": ""}},
    )
    # Resolve all open reports against this user
    await db.reports.update_many(
        {"target_user": user_id, "status": "open"}, {"$set": {"status": "resolved"}}
    )
    return {"ok": True}


@api.delete("/admin/users/{user_id}")
async def admin_delete_user(user_id: str, admin: Dict = Depends(get_admin)):
    await db.users.delete_one({"id": user_id})
    await db.checkins.delete_many({"user_id": user_id})
    return {"ok": True}


# -------------------- WEBSOCKET CHAT --------------------
class WSManager:
    def __init__(self):
        self.rooms: Dict[str, List[WebSocket]] = {}

    async def connect(self, match_id: str, ws: WebSocket):
        await ws.accept()
        self.rooms.setdefault(match_id, []).append(ws)

    def disconnect(self, match_id: str, ws: WebSocket):
        if match_id in self.rooms:
            try:
                self.rooms[match_id].remove(ws)
            except ValueError:
                pass

    async def broadcast(self, match_id: str, data: dict):
        for ws in list(self.rooms.get(match_id, [])):
            try:
                await ws.send_json(data)
            except Exception:
                pass


ws_manager = WSManager()


@app.websocket("/api/ws/chat/{match_id}")
async def chat_ws(websocket: WebSocket, match_id: str):
    await ws_manager.connect(match_id, websocket)
    try:
        while True:
            data = await websocket.receive_json()
            # broadcast typing indicators etc
            await ws_manager.broadcast(match_id, data)
    except WebSocketDisconnect:
        ws_manager.disconnect(match_id, websocket)
    except Exception as e:
        logger.error(f"WS err: {e}")
        ws_manager.disconnect(match_id, websocket)


# -------------------- SEED --------------------
SEED_VENUES = [
    {"name": "Neon Nights", "kind": "Nightclub", "city": "Miami", "lat": 25.7907, "lng": -80.1300, "image": "https://images.unsplash.com/photo-1566808907388-c3ce09bc004f?w=900&q=80", "vibe": "House & Techno"},
    {"name": "The Velvet Lounge", "kind": "Lounge", "city": "New York", "lat": 40.7228, "lng": -73.9871, "image": "https://images.unsplash.com/photo-1640330763728-a4393df80161?w=900&q=80", "vibe": "Cocktails & Jazz"},
    {"name": "Skyline Rooftop", "kind": "Rooftop Bar", "city": "Los Angeles", "lat": 34.0928, "lng": -118.3287, "image": "https://images.unsplash.com/photo-1572116469696-31de0f17cc34?w=900&q=80", "vibe": "Sunset Vibes"},
    {"name": "Pulse Beach Club", "kind": "Beach Club", "city": "Miami", "lat": 25.7825, "lng": -80.1340, "image": "https://images.unsplash.com/photo-1530103862676-de8c9debad1d?w=900&q=80", "vibe": "Day Party"},
    {"name": "Underground 88", "kind": "Nightclub", "city": "New York", "lat": 40.7280, "lng": -74.0020, "image": "https://images.unsplash.com/photo-1571266028243-d220c6a1b8c4?w=900&q=80", "vibe": "Underground Techno"},
    {"name": "The Aviary", "kind": "Cocktail Bar", "city": "Chicago", "lat": 41.8902, "lng": -87.6520, "image": "https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=900&q=80", "vibe": "Craft Cocktails"},
    {"name": "Sunset Tiki", "kind": "Bar", "city": "Los Angeles", "lat": 34.0822, "lng": -118.3640, "image": "https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=900&q=80", "vibe": "Tropical"},
    {"name": "Club Mirage", "kind": "Nightclub", "city": "Las Vegas", "lat": 36.1147, "lng": -115.1728, "image": "https://images.unsplash.com/photo-1574391884720-bbc3740c59d1?w=900&q=80", "vibe": "EDM & Bottle Service"},
]

SEED_USERS = [
    {"email": "ava@bump.app", "username": "ava_nyc", "first_name": "Ava", "age": 24, "gender": "female", "interested_in": "male", "bio": "Dance floor enthusiast. Tequila on the rocks.", "interests": ["House", "Tequila", "Sushi", "Yoga"], "photos": ["https://images.unsplash.com/photo-1546206724-efa0d6c656b1?w=600&q=80"]},
    {"email": "maya@bump.app", "username": "maya_design", "first_name": "Maya", "age": 26, "gender": "female", "interested_in": "male", "bio": "Designer by day, raver by night.", "interests": ["Techno", "Art", "Coffee", "Travel"], "photos": ["https://images.unsplash.com/photo-1570453584666-d5f09271751a?w=600&q=80"]},
    {"email": "leo@bump.app", "username": "leo_dj", "first_name": "Leo", "age": 28, "gender": "male", "interested_in": "female", "bio": "DJ. Producer. Looking for my muse.", "interests": ["Music", "Vinyl", "Whiskey"], "photos": ["https://images.unsplash.com/photo-1568822602205-62ac63d1268f?w=600&q=80"]},
    {"email": "zoe@bump.app", "username": "zoe_roof", "first_name": "Zoe", "age": 23, "gender": "female", "interested_in": "any", "bio": "Catch me on the rooftop.", "interests": ["Cocktails", "Travel", "Photography"], "photos": ["https://images.unsplash.com/photo-1502323777036-f29e3972d82f?w=600&q=80"]},
    {"email": "kai@bump.app", "username": "kai_surf", "first_name": "Kai", "age": 27, "gender": "male", "interested_in": "any", "bio": "Surf by day, dance by night.", "interests": ["Surf", "House", "Beach"], "photos": ["https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=600&q=80"]},
    {"email": "nia@bump.app", "username": "nia_wine", "first_name": "Nia", "age": 25, "gender": "female", "interested_in": "male", "bio": "Champagne tastes, beer budget.", "interests": ["Wine", "Fashion", "Hip Hop"], "photos": ["https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?w=600&q=80"]},
]


async def seed_data():
    # NOTE: Venues are no longer seeded; they're discovered dynamically from Google Places
    # based on user's GPS via /api/venues. See upsert_google_venues().
    # Remove any pre-existing seeded venues so only Google-discovered venues remain
    await db.venues.delete_many({"source": {"$ne": "google"}})

    # Ensure unique indexes for username, phone, email
    try:
        await db.users.create_index("email", unique=True, sparse=True)
        await db.users.create_index("username", unique=True, sparse=True)
        await db.users.create_index("phone", unique=True, sparse=True)
        await db.reset_tokens.create_index("expires_at", expireAfterSeconds=0)
        await db.email_otps.create_index("expires_at", expireAfterSeconds=0)
        # Auto-expiration TTL indexes (background MongoDB cleanup)
        # Checkins: expire when expires_at is reached (6h after check-in)
        await db.checkins.create_index("expires_at", expireAfterSeconds=0)
        # Messages: expire 24h after created_at (PRD: chats expire after 24h)
        await db.messages.create_index("created_at", expireAfterSeconds=24 * 60 * 60)
        # Matches: expire 24h after created_at to mirror chat lifecycle
        await db.matches.create_index("created_at", expireAfterSeconds=24 * 60 * 60)
        # Push tokens stale cleanup: 90 days since last update
        await db.push_tokens.create_index("updated_at", expireAfterSeconds=90 * 24 * 60 * 60)
    except Exception as e:
        logger.warning(f"Index creation: {e}")

    # Demo users (created without checkin; populate_demo_checkins will check them in
    # to newly-discovered Google venues when users request /api/venues with GPS)
    if await db.users.count_documents({"email": {"$regex": "@bump.app$"}}) < len(SEED_USERS):
        for u in SEED_USERS:
            exists = await db.users.find_one({"email": u["email"]})
            if exists:
                continue
            uid = str(uuid.uuid4())
            doc = {
                "id": uid,
                "email": u["email"],
                "username": u.get("username"),
                "password": hash_pwd("demo1234"),
                "first_name": u["first_name"],
                "age": u["age"],
                "gender": u["gender"],
                "interested_in": u["interested_in"],
                "bio": u["bio"],
                "interests": u["interests"],
                "photos": u["photos"],
                "is_admin": False,
                "is_hidden": False,
                "blocked_users": [],
                "email_verified": True,
                "created_at": utcnow(),
            }
            await db.users.insert_one(doc)
        # Clear any stale checkins pointing to deleted seed venues
        await db.checkins.delete_many({})
        logger.info("Seeded demo users (no checkins; will populate on first GPS request)")

    # Backfill usernames on existing demo users (in case they were created without them)
    for u in SEED_USERS:
        await db.users.update_one(
            {"email": u["email"], "$or": [{"username": {"$exists": False}}, {"username": None}]},
            {"$set": {"username": u["username"]}},
        )

    # Admin
    admin = await db.users.find_one({"email": "admin@bump.app"})
    if not admin:
        doc = {
            "id": str(uuid.uuid4()),
            "email": "admin@bump.app",
            "password": hash_pwd("admin1234"),
            "first_name": "Admin",
            "age": 30,
            "gender": "any",
            "interested_in": "any",
            "bio": "BUMP Admin",
            "interests": [],
            "photos": [],
            "is_admin": True,
            "is_hidden": True,
            "blocked_users": [],
            "created_at": utcnow(),
        }
        await db.users.insert_one(doc)
        logger.info("Seeded admin user")


@app.on_event("startup")
async def startup():
    try:
        await seed_data()
    except Exception as e:
        logger.error(f"Seed err: {e}")


@app.on_event("shutdown")
async def shutdown():
    client.close()


@api.get("/")
async def root():
    return {"app": "BUMP", "tagline": "Break the ice nearby."}


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
