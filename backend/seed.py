"""Seed demo users + index creation. Idempotent on startup."""
import uuid
from config import logger
from db import db
from deps import utcnow, hash_pwd

SEED_USERS = [
    {"email": "ava@bump.app", "username": "ava_nyc", "first_name": "Ava", "age": 24, "gender": "female", "interested_in": "male", "bio": "Dance floor enthusiast. Tequila on the rocks.", "interests": ["House", "Tequila", "Sushi", "Yoga"], "photos": ["https://images.unsplash.com/photo-1546206724-efa0d6c656b1?w=600&q=80"]},
    {"email": "maya@bump.app", "username": "maya_design", "first_name": "Maya", "age": 26, "gender": "female", "interested_in": "male", "bio": "Designer by day, raver by night.", "interests": ["Techno", "Art", "Coffee", "Travel"], "photos": ["https://images.unsplash.com/photo-1570453584666-d5f09271751a?w=600&q=80"]},
    {"email": "leo@bump.app", "username": "leo_dj", "first_name": "Leo", "age": 28, "gender": "male", "interested_in": "female", "bio": "DJ. Producer. Looking for my muse.", "interests": ["Music", "Vinyl", "Whiskey"], "photos": ["https://images.unsplash.com/photo-1568822602205-62ac63d1268f?w=600&q=80"]},
    {"email": "zoe@bump.app", "username": "zoe_roof", "first_name": "Zoe", "age": 23, "gender": "female", "interested_in": "any", "bio": "Catch me on the rooftop.", "interests": ["Cocktails", "Travel", "Photography"], "photos": ["https://images.unsplash.com/photo-1502323777036-f29e3972d82f?w=600&q=80"]},
    {"email": "kai@bump.app", "username": "kai_surf", "first_name": "Kai", "age": 27, "gender": "male", "interested_in": "any", "bio": "Surf by day, dance by night.", "interests": ["Surf", "House", "Beach"], "photos": ["https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=600&q=80"]},
    {"email": "nia@bump.app", "username": "nia_wine", "first_name": "Nia", "age": 25, "gender": "female", "interested_in": "male", "bio": "Champagne tastes, beer budget.", "interests": ["Wine", "Fashion", "Hip Hop"], "photos": ["https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?w=600&q=80"]},
]


async def seed_data():
    # Venues are dynamically discovered from Google Places. Strip pre-seeded ones.
    await db.venues.delete_many({"source": {"$ne": "google"}})

    # Unique + TTL indexes
    try:
        await db.users.create_index("email", unique=True, sparse=True)
        await db.users.create_index("username", unique=True, sparse=True)
        await db.users.create_index("phone", unique=True, sparse=True)
        await db.reset_tokens.create_index("expires_at", expireAfterSeconds=0)
        await db.email_otps.create_index("expires_at", expireAfterSeconds=0)
        await db.checkins.create_index("expires_at", expireAfterSeconds=0)
        await db.messages.create_index("created_at", expireAfterSeconds=24 * 60 * 60)
        await db.matches.create_index("created_at", expireAfterSeconds=24 * 60 * 60)
        await db.push_tokens.create_index("updated_at", expireAfterSeconds=90 * 24 * 60 * 60)
    except Exception as e:
        logger.warning(f"Index creation: {e}")

    # Demo users
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
        await db.checkins.delete_many({})
        logger.info("Seeded demo users (no checkins; will populate on first GPS request)")

    # Backfill usernames
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
