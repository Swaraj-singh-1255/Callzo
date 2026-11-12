"""
Local stand-in for meetrj/callzo-mock-usage-api.

Implements Task2_spec.md so the admin console can run on amd64 (Windows/Linux)
when the official image is arm64-only.
"""

from __future__ import annotations

import hashlib
import random
import re
from datetime import date, datetime, timedelta
from typing import Any, Optional

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

app = FastAPI(title="Callzo Mock Usage API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Seed data (~10,500 accounts)
# ---------------------------------------------------------------------------

COUNTRIES = ["US", "IN", "GB", "CA", "AU"]
PLANS = ["basic", "pro", "enterprise"]
STATUSES = ["active", "trial", "suspended"]
FIRST = [
    "Alex", "Jordan", "Sam", "Taylor", "Casey", "Riley", "Morgan", "Quinn",
    "Avery", "Jamie", "Cameron", "Drew", "Parker", "Reese", "Skyler",
]
LAST = [
    "Smith", "Patel", "Johnson", "Garcia", "Chen", "Kim", "Singh", "Brown",
    "Williams", "Davis", "Miller", "Wilson", "Moore", "Taylor", "Anderson",
]
COMPANIES = [
    "Acme", "Globex", "Initech", "Umbrella", "Stark", "Wayne", "Oscorp",
    "Hooli", "Pied Piper", "Massive Dynamic", "Soylent", "Cyberdyne",
]


def _seed_account(i: int) -> dict[str, Any]:
    rng = random.Random(i * 7919 + 13)
    first = FIRST[i % len(FIRST)]
    last = LAST[(i * 7) % len(LAST)]
    company = f"{COMPANIES[i % len(COMPANIES)]} {rng.randint(1, 99)}"
    country = COUNTRIES[i % len(COUNTRIES)]
    plan = PLANS[i % len(PLANS)]
    status = STATUSES[i % len(STATUSES)]
    signup = date(2024, 1, 1) + timedelta(days=(i * 3) % 700)
    last_active = signup + timedelta(days=rng.randint(0, 200))
    minutes = rng.randint(0, 5000)
    sms = rng.randint(0, 800)
    # Rough cost in cents from minutes + sms
    cost = minutes * 12 + sms * 5 + rng.randint(0, 500)
    return {
        "id": i,
        "name": f"{first} {last}",
        "email": f"{first.lower()}.{last.lower()}{i}@example.com",
        "company": company,
        "country": country,
        "plan": plan,
        "status": status,
        "signup_date": signup.isoformat(),
        "current_month_minutes": minutes,
        "current_month_sms": sms,
        "cost_cents": cost,
        "last_active": last_active.isoformat(),
    }


N_ACCOUNTS = 10_500
ACCOUNTS: list[dict[str, Any]] = [_seed_account(i) for i in range(1, N_ACCOUNTS + 1)]
BY_ID: dict[int, dict[str, Any]] = {a["id"]: a for a in ACCOUNTS}

# Per-account settings drafts: {account_id: {"1": {...}, "2": {...}, ...}}
SETTINGS: dict[int, dict[str, Any]] = {}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _drift(row: dict[str, Any]) -> dict[str, Any]:
    """Slight random drift on usage fields (simulates live data)."""
    out = dict(row)
    # ~8% of rows change a little on each fetch
    h = int(hashlib.md5(f"{row['id']}-{datetime.utcnow().minute}".encode()).hexdigest()[:8], 16)
    if h % 12 == 0:
        delta_m = (h % 7) - 3
        delta_s = (h % 5) - 2
        out["current_month_minutes"] = max(0, row["current_month_minutes"] + delta_m)
        out["current_month_sms"] = max(0, row["current_month_sms"] + delta_s)
        out["cost_cents"] = max(
            0,
            row["cost_cents"] + delta_m * 12 + delta_s * 5,
        )
    return out


def _match_search(a: dict[str, Any], q: str) -> bool:
    q = q.lower()
    return (
        q in a["name"].lower()
        or q in a["email"].lower()
        or q in a["company"].lower()
    )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/health")
def health():
    return {"status": "ok", "accounts": N_ACCOUNTS}


@app.get("/accounts")
def list_accounts(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    search: Optional[str] = None,
    status: Optional[str] = None,
    country: Optional[str] = None,
    plan: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    sort_by: str = Query("id"),
    sort_dir: str = Query("asc"),
):
    rows = ACCOUNTS

    if search:
        rows = [a for a in rows if _match_search(a, search)]
    if status:
        rows = [a for a in rows if a["status"] == status]
    if country:
        rows = [a for a in rows if a["country"] == country]
    if plan:
        rows = [a for a in rows if a["plan"] == plan]
    if date_from:
        rows = [a for a in rows if a["signup_date"] >= date_from]
    if date_to:
        rows = [a for a in rows if a["signup_date"] <= date_to]

    allowed_sort = {
        "id",
        "name",
        "company",
        "country",
        "plan",
        "status",
        "signup_date",
        "current_month_minutes",
        "current_month_sms",
        "cost_cents",
        "last_active",
    }
    if sort_by not in allowed_sort:
        sort_by = "id"
    reverse = sort_dir.lower() == "desc"
    rows = sorted(rows, key=lambda a: a.get(sort_by) or 0, reverse=reverse)

    total = len(rows)
    start = (page - 1) * page_size
    end = start + page_size
    page_rows = [_drift(a) for a in rows[start:end]]

    return {
        "data": page_rows,
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@app.get("/accounts/summary")
def summary(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
):
    # Deliberate random failure ~1 in 5
    if random.random() < 0.20:
        raise HTTPException(status_code=500, detail="Random summary failure (intentional)")

    # Build a simple daily series over a window
    end = date.today()
    start = end - timedelta(days=29)
    if date_from:
        try:
            start = date.fromisoformat(date_from)
        except ValueError:
            pass
    if date_to:
        try:
            end = date.fromisoformat(date_to)
        except ValueError:
            pass
    if start > end:
        start, end = end, start

    series = []
    d = start
    while d <= end and len(series) < 90:
        # Deterministic-ish numbers from date
        seed = int(d.strftime("%Y%m%d"))
        rng = random.Random(seed)
        series.append(
            {
                "date": d.isoformat(),
                "minutes": rng.randint(2000, 12000),
                "sms": rng.randint(500, 4000),
                "cost_cents": rng.randint(50_000, 2_500_000),
                "signups": rng.randint(5, 40),
            }
        )
        d += timedelta(days=1)

    # Count accounts in signup range (approx)
    total_in_range = sum(
        1
        for a in ACCOUNTS
        if (not date_from or a["signup_date"] >= date_from)
        and (not date_to or a["signup_date"] <= date_to)
    )

    return {"series": series, "total_accounts": total_in_range}


@app.get("/accounts/{account_id}")
def get_account(account_id: int):
    a = BY_ID.get(account_id)
    if not a:
        raise HTTPException(status_code=404, detail="Account not found")
    return _drift(a)


# ---- Settings form --------------------------------------------------------

class StepBody(BaseModel):
    data: dict[str, Any] = Field(default_factory=dict)


def _validate_step(step: int, data: dict[str, Any], account_id: int) -> Optional[dict]:
    """Return error dict or None if valid."""
    errors: dict[str, str] = {}

    if step == 1:
        if not (data.get("name") or "").strip():
            errors["name"] = "name is required"
        email = (data.get("email") or "").strip()
        if not email:
            errors["email"] = "email is required"
        elif "@" not in email:
            errors["email"] = "email must contain @"

    elif step == 2:
        plan = data.get("plan")
        if plan not in PLANS:
            errors["plan"] = "plan is required"
        bc = data.get("billing_country")
        if bc not in COUNTRIES:
            errors["billing_country"] = "billing_country is required"
        # Deliberate quirk: once step 4 draft exists, reject billing_country
        draft = SETTINGS.get(account_id, {})
        if "4" in draft and bc:
            errors["billing_country"] = "billing_country is required"

    elif step == 3:
        for key in ("minutes_cap", "sms_cap"):
            if key in data and data[key] is not None:
                try:
                    float(data[key])
                except (TypeError, ValueError):
                    errors[key] = f"{key} must be a number"

    elif step == 4:
        url = data.get("webhook_url")
        if url is not None and str(url).strip():
            u = str(url).strip()
            if not (u.startswith("http://") or u.startswith("https://")):
                errors["webhook_url"] = "webhook_url must start with http:// or https://"

    else:
        raise HTTPException(status_code=400, detail="step must be 1-4")

    if errors:
        return {"step": step, "errors": errors}
    return None


@app.get("/accounts/{account_id}/settings")
def get_settings(account_id: int):
    if account_id not in BY_ID:
        raise HTTPException(status_code=404, detail="Account not found")
    return SETTINGS.get(account_id, {})


@app.put("/accounts/{account_id}/settings/step/{step}")
def save_step(account_id: int, step: int, body: StepBody):
    if account_id not in BY_ID:
        raise HTTPException(status_code=404, detail="Account not found")
    if step < 1 or step > 4:
        raise HTTPException(status_code=400, detail="step must be 1-4")

    err = _validate_step(step, body.data, account_id)
    if err:
        return JSONResponse(status_code=422, content={"detail": err})

    if account_id not in SETTINGS:
        SETTINGS[account_id] = {}
    SETTINGS[account_id][str(step)] = body.data
    return {"step": step, "saved": True, "data": body.data}


@app.post("/accounts/{account_id}/settings/submit")
def submit_settings(account_id: int):
    if account_id not in BY_ID:
        raise HTTPException(status_code=404, detail="Account not found")
    draft = SETTINGS.get(account_id, {})
    missing = [s for s in ("1", "2", "3", "4") if s not in draft]
    if missing:
        raise HTTPException(
            status_code=400,
            detail={"missing_steps": [int(s) for s in missing]},
        )
    return {"submitted": True, "account_id": account_id}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8001)
