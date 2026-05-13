"""Resend transactional email helpers."""
import asyncio

try:
    import resend
except ImportError:
    resend = None

from config import RESEND_API_KEY, RESEND_FROM_EMAIL, APP_DEEPLINK_SCHEME, logger

if resend and RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY


async def send_email_otp(email: str, code: str, purpose: str) -> bool:
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
