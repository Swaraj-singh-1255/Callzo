import hashlib
import hmac
import json
import os
import uuid

import httpx
import pytest

BASE_URL = os.getenv("TEST_BASE_URL", "http://localhost:8000")
WEBHOOK_SECRET = os.getenv("WEBHOOK_SECRET", "callzo_test_secret_change_me")
API_KEY = os.getenv("API_KEY", "callzo_api_key_change_me")


def sign(body: bytes) -> str:
    return hmac.new(WEBHOOK_SECRET.encode(), body, hashlib.sha256).hexdigest()


@pytest.fixture
def client():
    with httpx.Client(base_url=BASE_URL, timeout=10) as c:
        yield c


@pytest.fixture
def account_id():
    # fresh account per test so tests never interfere with each other
    return f"acct_{uuid.uuid4().hex[:12]}"


@pytest.fixture
def send(client):
    def _send(payload: dict, signature: str | None = None):
        body = json.dumps(payload).encode()
        headers = {"Content-Type": "application/json",
                   "X-Signature": signature if signature is not None else sign(body)}
        return client.post("/webhooks/calls", content=body, headers=headers)
    return _send


@pytest.fixture
def usage(client):
    def _usage(account_id: str, month: str = "2026-11"):
        return client.get(f"/accounts/{account_id}/usage",
                          params={"month": month},
                          headers={"X-API-Key": API_KEY})
    return _usage


@pytest.fixture
def make_event():
    def _make(account_id, call_id=None, event_type="call.ended",
              duration=60, cost=10, ts="2026-11-10T07:00:00Z"):
        return {
            "event_id": f"evt_{uuid.uuid4().hex[:12]}",
            "event_type": event_type,
            "account_id": account_id,
            "call_id": call_id or f"call_{uuid.uuid4().hex[:12]}",
            "timestamp": ts,
            "duration_seconds": duration,
            "cost_cents": cost,
        }
    return _make