"""Resend transactional email helpers (improved deliverability)."""
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
        logger.warning(f"Resend not configured \u2014 OTP for {email}: {code}")
        return False
    try:
        subject = {
            "signup": "Welcome to BUMP \u2014 confirm your email",
            "login": "Your BUMP sign-in code",
            "reset": "Reset your BUMP password",
        }.get(purpose, "Confirm your BUMP email")
        action = {
            "signup": "finish creating your BUMP account",
            "login": "sign in to BUMP",
            "reset": "reset your password",
        }.get(purpose, "confirm your email")
        plain_text = (
            f"Hi there,\n\n"
            f"Your BUMP verification code is: {code}\n\n"
            f"Use this code to {action}. The code expires in 10 minutes.\n\n"
            f"If you didn't request this, you can safely ignore this email.\n\n"
            f"\u2014 The BUMP Team\n"
            f"https://bumpnetwork.me\n"
        )
        html = f"""
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px; background: #ffffff; color: #1a1a1a;">
          <div style="padding-bottom: 24px; border-bottom: 1px solid #eaeaea;">
            <div style="font-size: 24px; font-weight: 800; letter-spacing: -0.5px; color: #0a0a0f;">BUMP</div>
            <div style="color: #6b7280; font-size: 13px; margin-top: 4px;">Break the ice nearby</div>
          </div>
          <h1 style="font-size: 20px; font-weight: 700; color: #0a0a0f; margin: 28px 0 12px;">Hi there,</h1>
          <p style="color: #374151; font-size: 15px; line-height: 1.6; margin: 0 0 20px;">
            Use the code below to {action}:
          </p>
          <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 28px; text-align: center; margin: 24px 0;">
            <div style="color: #0a0a0f; font-size: 32px; font-weight: 800; letter-spacing: 10px; font-family: 'SF Mono', Menlo, Consolas, monospace;">{code}</div>
            <div style="color: #6b7280; font-size: 12px; margin-top: 12px;">This code expires in 10 minutes</div>
          </div>
          <p style="color: #6b7280; font-size: 13px; line-height: 1.6; margin: 16px 0;">
            If you didn't request this email, you can safely ignore it \u2014 someone may have typed your address by mistake.
          </p>
          <hr style="border: none; border-top: 1px solid #eaeaea; margin: 32px 0 16px;">
          <p style="color: #9ca3af; font-size: 12px; line-height: 1.5; margin: 0;">
            BUMP is a proximity-based social network for meeting people at nightlife venues nearby.
            <br>
            <a href="https://bumpnetwork.me" style="color: #6b7280; text-decoration: underline;">bumpnetwork.me</a>
          </p>
        </div>
        """
        await asyncio.to_thread(
            lambda: resend.Emails.send({
                "from": f"BUMP <{RESEND_FROM_EMAIL}>",
                "to": [email],
                "subject": subject,
                "html": html,
                "text": plain_text,
                "reply_to": RESEND_FROM_EMAIL,
            })
        )
        return True
    except Exception as e:
        logger.error(f"Resend send err: {e}")
        return False


async def send_email_reset_link(email: str, token: str) -> bool:
    if not resend or not RESEND_API_KEY:
        logger.warning(f"Resend not configured \u2014 Reset link for {email}: {token}")
        return False
    try:
        link = f"{APP_DEEPLINK_SCHEME}://reset?token={token}"
        subject = "Reset your BUMP password"
        plain_text = (
            f"Hi there,\n\n"
            f"You requested to reset your BUMP password.\n\n"
            f"Open this link on your phone: {link}\n\n"
            f"Or copy this token into the app: {token}\n\n"
            f"This link expires in 30 minutes. If you didn't request this, ignore this email.\n\n"
            f"\u2014 The BUMP Team\n"
            f"https://bumpnetwork.me\n"
        )
        html = f"""
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px; background: #ffffff; color: #1a1a1a;">
          <div style="padding-bottom: 24px; border-bottom: 1px solid #eaeaea;">
            <div style="font-size: 24px; font-weight: 800; letter-spacing: -0.5px; color: #0a0a0f;">BUMP</div>
            <div style="color: #6b7280; font-size: 13px; margin-top: 4px;">Break the ice nearby</div>
          </div>
          <h1 style="font-size: 20px; font-weight: 700; color: #0a0a0f; margin: 28px 0 12px;">Reset your password</h1>
          <p style="color: #374151; font-size: 15px; line-height: 1.6; margin: 0 0 24px;">
            Tap the button below to choose a new password. This link expires in 30 minutes.
          </p>
          <a href="{link}" style="display: inline-block; background: #0a0a0f; color: #ffffff; padding: 14px 28px; border-radius: 8px; font-weight: 700; text-decoration: none;">Reset my password</a>
          <p style="color: #6b7280; font-size: 13px; margin: 28px 0 8px;">
            Or copy this token into the app:
          </p>
          <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; font-family: 'SF Mono', Menlo, Consolas, monospace; font-size: 12px; color: #1a1a1a; word-break: break-all;">{token}</div>
          <p style="color: #6b7280; font-size: 13px; line-height: 1.6; margin: 24px 0 0;">
            If you didn't request this, you can safely ignore this email.
          </p>
          <hr style="border: none; border-top: 1px solid #eaeaea; margin: 32px 0 16px;">
          <p style="color: #9ca3af; font-size: 12px; line-height: 1.5; margin: 0;">
            BUMP is a proximity-based social network for meeting people at nightlife venues nearby.
            <br>
            <a href="https://bumpnetwork.me" style="color: #6b7280; text-decoration: underline;">bumpnetwork.me</a>
          </p>
        </div>
        """
        await asyncio.to_thread(
            lambda: resend.Emails.send({
                "from": f"BUMP <{RESEND_FROM_EMAIL}>",
                "to": [email],
                "subject": subject,
                "html": html,
                "text": plain_text,
                "reply_to": RESEND_FROM_EMAIL,
            })
        )
        return True
    except Exception as e:
        logger.error(f"Resend reset err: {e}")
        return False
