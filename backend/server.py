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
from fastapi import FastAPI, APIRouter, Depends, HTTPException, status, WebSocket, WebSocketDisconnect
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# -------------------- CONFIG --------------------
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
SECRET_KEY = os.environ.get("JWT_SECRET", "bump-super-secret-dev-key-change-in-prod-2026")
ALGORITHM = "HS256"
TOKEN_EXPIRE_HOURS = 24 * 30  # 30 days for mobile
SELFIE_EXPIRE_HOURS = 6
CHAT_EXPIRE_HOURS = 24

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("bump")

app = FastAPI(title="BUMP API")
api = APIRouter(prefix="/api")
bearer = HTTPBearer(auto_error=False)


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
    reason: str


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


@api.put("/profile")
async def update_profile(body: ProfileIn, user: Dict = Depends(get_user)):
    updates = {k: v for k, v in body.dict().items() if v is not None}
    if updates:
        updates["updated_at"] = utcnow()
        await db.users.update_one({"id": user["id"]}, {"$set": updates})
    updated = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password": 0})
    return updated


# -------------------- VENUES --------------------
@api.get("/venues")
async def list_venues(lat: float = 0, lng: float = 0, user: Dict = Depends(get_user)):
    venues = await db.venues.find({}, {"_id": 0}).to_list(500)
    now = utcnow()
    cutoff = now - timedelta(hours=SELFIE_EXPIRE_HOURS)
    for v in venues:
        v["distance_m"] = int(haversine_m(lat, lng, v["lat"], v["lng"])) if lat or lng else None
        active = await db.checkins.count_documents({
            "venue_id": v["id"],
            "expires_at": {"$gt": now},
        })
        v["active_count"] = active
    if lat or lng:
        venues.sort(key=lambda x: x.get("distance_m") or 0)
    return venues


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
    return msg


# -------------------- SAFETY --------------------
@api.post("/safety/block/{target_id}")
async def block_user(target_id: str, user: Dict = Depends(get_user)):
    await db.users.update_one({"id": user["id"]}, {"$addToSet": {"blocked_users": target_id}})
    return {"ok": True}


@api.post("/safety/unblock/{target_id}")
async def unblock_user(target_id: str, user: Dict = Depends(get_user)):
    await db.users.update_one({"id": user["id"]}, {"$pull": {"blocked_users": target_id}})
    return {"ok": True}


@api.post("/safety/report")
async def report_user(body: ReportIn, user: Dict = Depends(get_user)):
    rec = {
        "id": str(uuid.uuid4()),
        "from_user": user["id"],
        "target_user": body.target_user_id,
        "reason": body.reason,
        "status": "open",
        "created_at": utcnow(),
    }
    await db.reports.insert_one(rec.copy())
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
    {"email": "ava@bump.app", "first_name": "Ava", "age": 24, "gender": "female", "interested_in": "male", "bio": "Dance floor enthusiast. Tequila on the rocks.", "interests": ["House", "Tequila", "Sushi", "Yoga"], "photos": ["https://images.unsplash.com/photo-1546206724-efa0d6c656b1?w=600&q=80"]},
    {"email": "maya@bump.app", "first_name": "Maya", "age": 26, "gender": "female", "interested_in": "male", "bio": "Designer by day, raver by night.", "interests": ["Techno", "Art", "Coffee", "Travel"], "photos": ["https://images.unsplash.com/photo-1570453584666-d5f09271751a?w=600&q=80"]},
    {"email": "leo@bump.app", "first_name": "Leo", "age": 28, "gender": "male", "interested_in": "female", "bio": "DJ. Producer. Looking for my muse.", "interests": ["Music", "Vinyl", "Whiskey"], "photos": ["https://images.unsplash.com/photo-1568822602205-62ac63d1268f?w=600&q=80"]},
    {"email": "zoe@bump.app", "first_name": "Zoe", "age": 23, "gender": "female", "interested_in": "any", "bio": "Catch me on the rooftop.", "interests": ["Cocktails", "Travel", "Photography"], "photos": ["https://images.unsplash.com/photo-1502323777036-f29e3972d82f?w=600&q=80"]},
    {"email": "kai@bump.app", "first_name": "Kai", "age": 27, "gender": "male", "interested_in": "any", "bio": "Surf by day, dance by night.", "interests": ["Surf", "House", "Beach"], "photos": ["https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=600&q=80"]},
    {"email": "nia@bump.app", "first_name": "Nia", "age": 25, "gender": "female", "interested_in": "male", "bio": "Champagne tastes, beer budget.", "interests": ["Wine", "Fashion", "Hip Hop"], "photos": ["https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?w=600&q=80"]},
]


async def seed_data():
    # Venues
    if await db.venues.count_documents({}) == 0:
        for v in SEED_VENUES:
            doc = {**v, "id": str(uuid.uuid4()), "geofence_radius_m": 250, "created_at": utcnow()}
            await db.venues.insert_one(doc)
        logger.info("Seeded venues")

    # Demo users
    if await db.users.count_documents({"email": {"$regex": "@bump.app$"}}) < len(SEED_USERS):
        venues = await db.venues.find({}, {"_id": 0}).to_list(20)
        for i, u in enumerate(SEED_USERS):
            exists = await db.users.find_one({"email": u["email"]})
            if exists:
                continue
            uid = str(uuid.uuid4())
            doc = {
                "id": uid,
                "email": u["email"],
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
                "created_at": utcnow(),
            }
            await db.users.insert_one(doc)
            # check them into venue
            v = venues[i % len(venues)]
            now = utcnow()
            ci = {
                "id": str(uuid.uuid4()),
                "user_id": uid,
                "venue_id": v["id"],
                "selfie_base64": u["photos"][0],
                "lat": v["lat"],
                "lng": v["lng"],
                "checked_in_at": now,
                "expires_at": now + timedelta(hours=SELFIE_EXPIRE_HOURS),
            }
            await db.checkins.insert_one(ci)
        logger.info("Seeded demo users + checkins")

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
