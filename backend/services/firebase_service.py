"""Firebase Admin SDK init + token verification.

Verifies Firebase Phone Auth ID tokens server-side. Lazy init so backend boots
even if the service-account file is missing in dev.
"""
from pathlib import Path
from typing import Optional, Dict, Any

try:
    import firebase_admin
    from firebase_admin import credentials, auth as fb_auth
    _FIREBASE_AVAILABLE = True
except ImportError:
    _FIREBASE_AVAILABLE = False
    firebase_admin = None
    fb_auth = None

from config import logger

_app = None
_init_attempted = False
SERVICE_ACCOUNT_PATH = Path(__file__).resolve().parent.parent / "secrets" / "firebase-admin.json"


def _ensure_init() -> bool:
    global _app, _init_attempted
    if _init_attempted:
        return _app is not None
    _init_attempted = True
    if not _FIREBASE_AVAILABLE:
        logger.warning("firebase-admin not installed")
        return False
    if not SERVICE_ACCOUNT_PATH.exists():
        logger.warning(f"Firebase service account not found at {SERVICE_ACCOUNT_PATH}")
        return False
    try:
        if firebase_admin._apps:
            _app = firebase_admin.get_app()
        else:
            cred = credentials.Certificate(str(SERVICE_ACCOUNT_PATH))
            _app = firebase_admin.initialize_app(cred)
        logger.info("Firebase Admin SDK initialized")
        return True
    except Exception as e:
        logger.error(f"Firebase init failed: {e}")
        return False


def is_available() -> bool:
    return _ensure_init()


def verify_id_token(id_token: str) -> Optional[Dict[str, Any]]:
    """Verify a Firebase ID token. Returns the decoded claims or None on failure."""
    if not _ensure_init():
        return None
    try:
        decoded = fb_auth.verify_id_token(id_token, check_revoked=False)
        return decoded
    except Exception as e:
        logger.warning(f"Firebase token verify failed: {e}")
        return None
