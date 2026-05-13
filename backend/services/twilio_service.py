"""Twilio client + Verify Service auto-provisioning."""
import asyncio
from typing import Optional

try:
    from twilio.rest import Client as TwilioClient
except ImportError:
    TwilioClient = None

from config import TWILIO_SID, TWILIO_TOKEN, TWILIO_VERIFY_SID, logger
from db import db

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
    global _twilio_verify_sid_cache
    if _twilio_verify_sid_cache:
        return _twilio_verify_sid_cache
    if TWILIO_VERIFY_SID:
        _twilio_verify_sid_cache = TWILIO_VERIFY_SID
        return _twilio_verify_sid_cache
    rec = await db.config.find_one({"key": "twilio_verify_sid"})
    if rec and rec.get("value"):
        _twilio_verify_sid_cache = rec["value"]
        return _twilio_verify_sid_cache
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
