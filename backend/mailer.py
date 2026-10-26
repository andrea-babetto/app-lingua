"""Sending email (optional): used for "forgot password".

Works with any provider that offers SMTP (Brevo, Resend, Mailgun, Amazon SES, Gmail with an app password...).
Enabled only when SMTP_HOST and MAIL_FROM are set; without them the app simply does not offer password recovery by email.
Settings: SMTP_HOST, SMTP_PORT (587 = STARTTLS, 465 = SSL), SMTP_USER, SMTP_PASSWORD, MAIL_FROM (e.g. "Glotter <no-reply@your-domain>").
"""
import asyncio
import logging
import os
import smtplib
import ssl
from email.message import EmailMessage

logger = logging.getLogger(__name__)
sent = []  # in tests: the messages that would have been sent


def enabled() -> bool:
    return bool(os.environ.get("SMTP_HOST", "").strip() and os.environ.get("MAIL_FROM", "").strip())


def _send(to: str, subject: str, text: str):
    host = os.environ["SMTP_HOST"].strip()
    port = int(os.environ.get("SMTP_PORT", "587") or 587)
    user, password = os.environ.get("SMTP_USER", ""), os.environ.get("SMTP_PASSWORD", "")
    msg = EmailMessage()
    msg["From"], msg["To"], msg["Subject"] = os.environ["MAIL_FROM"].strip(), to, subject
    msg.set_content(text)
    ctx = ssl.create_default_context()
    if port == 465:
        with smtplib.SMTP_SSL(host, port, context=ctx, timeout=20) as s:
            if user:
                s.login(user, password)
            s.send_message(msg)
    else:
        with smtplib.SMTP(host, port, timeout=20) as s:
            s.starttls(context=ctx)
            if user:
                s.login(user, password)
            s.send_message(msg)


async def send(to: str, subject: str, text: str) -> bool:
    """Send one plain-text email. Never raises: a failure is logged and returns False."""
    if os.environ.get("APP_ENV") == "test":
        sent.append({"to": to, "subject": subject, "text": text})
        logger.warning("test mode, email not sent: %s | %s", subject, " ".join(text.split()))  # the demo server's log shows the link
        return True
    if not enabled():
        return False
    try:
        await asyncio.to_thread(_send, to, subject, text)
        return True
    except Exception as e:
        logger.warning("email to %s not sent: %s", to.split("@")[-1], e)
        return False
