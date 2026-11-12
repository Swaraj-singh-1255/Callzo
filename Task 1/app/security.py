import hmac
import hashlib
from app.config import get_settings


def verify_signature(raw_body: bytes, signature_header: str | None) -> bool:
    if not signature_header:
        return False
    settings = get_settings()
    expected = hmac.new(
        settings.webhook_secret.encode("utf-8"),
        raw_body,
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, signature_header.strip())


def verify_api_key(api_key_header: str | None) -> bool:
    if not api_key_header:
        return False
    settings = get_settings()
    return hmac.compare_digest(settings.api_key, api_key_header.strip())