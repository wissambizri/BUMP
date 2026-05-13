"""Identifier detection, OTP generation/validation, scope tokens, horoscope.
No route logic; pure helpers used by auth + account routes.
"""
import re
import secrets
from datetime import timedelta
from typing import Optional, Dict, Any
import jwt
import bcrypt

from config import SECRET_KEY, ALGORITHM
from db import db
from deps import utcnow, ensure_aware

# ----- identifier regexes -----
USERNAME_RE = re.compile(r"^[a-zA-Z0-9_]{3,20}$")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
PHONE_RE = re.compile(r"^\+\d{8,16}$")


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


# ----- OTP -----
def gen_otp_code() -> str:
    return "".join([str(secrets.randbelow(10)) for _ in range(6)])


def hash_otp(code: str) -> str:
    return bcrypt.hashpw(code.encode(), bcrypt.gensalt(rounds=8)).decode()


def check_otp(code: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(code.encode(), hashed.encode())
    except Exception:
        return False


async def consume_email_otp(email: str, code: str, purpose: str) -> bool:
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


def consume_scope_token(token: str, purpose: str) -> Optional[str]:
    try:
        data = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.PyJWTError:
        return None
    if data.get("scope") != f"verified_{purpose}":
        return None
    return data.get("email")


# ----- horoscope -----
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


# ----- safety -----
REPORT_CATEGORIES = {
    "spam": "Spam or scam",
    "harassment": "Harassment or hate",
    "inappropriate_photo": "Inappropriate photos",
    "fake_profile": "Fake profile",
    "underage": "Underage user",
    "violence": "Violence or threats",
    "other": "Something else",
}
