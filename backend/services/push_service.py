"""Expo push notification client + send_push fire-and-forget helper."""
import asyncio
from typing import Optional, Dict, Any

try:
    from exponent_server_sdk import PushClient, PushMessage  # type: ignore
except ImportError:
    PushClient = None
    PushMessage = None

from config import logger
from db import db

_push_client = None


def get_push_client():
    global _push_client
    if _push_client is None and PushClient is not None:
        _push_client = PushClient()
    return _push_client


async def send_push(user_id: str, title: str, body: str, data: Optional[Dict[str, Any]] = None):
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
