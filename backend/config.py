"""BUMP - configuration and env loading. Single source for env-derived constants."""
import os
import logging
from pathlib import Path
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
SECRET_KEY = os.environ.get("JWT_SECRET", "bump-super-secret-dev-key-change-in-prod-2026")
GOOGLE_API_KEY = os.environ.get("GOOGLE_PLACES_API_KEY", "")
TWILIO_SID = os.environ.get("TWILIO_ACCOUNT_SID", "")
TWILIO_TOKEN = os.environ.get("TWILIO_AUTH_TOKEN", "")
TWILIO_VERIFY_SID = os.environ.get("TWILIO_VERIFY_SERVICE_SID", "")
RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
RESEND_FROM_EMAIL = os.environ.get("RESEND_FROM_EMAIL", "onboarding@resend.dev")
APP_DEEPLINK_SCHEME = os.environ.get("APP_DEEPLINK_SCHEME", "bump")
EMERGENT_AUTH_API = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"

def demo_mode() -> bool:
    return os.environ.get("DEMO_MODE", "1") == "1"

ALGORITHM = "HS256"
TOKEN_EXPIRE_HOURS = 24 * 30
SELFIE_EXPIRE_HOURS = 6
CHAT_EXPIRE_HOURS = 24
PLACES_RADIUS_M = 2000
PLACES_CACHE_TTL_SECONDS = 3600
AUTO_HIDE_THRESHOLD = 3

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("bump")
