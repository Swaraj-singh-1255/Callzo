import asyncio
import json
import logging
import re
from contextlib import asynccontextmanager
import structlog
from fastapi import FastAPI, Request, Depends, Header, HTTPException, Query, Path
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import ValidationError
from sqlalchemy import select, text

from app.config import get_settings
from app.database import get_db, init_db, AsyncSessionLocal
from app.schemas import CallEvent, UsageResponse, HealthResponse
from app.security import verify_signature, verify_api_key
from app.services import (
    process_event, get_usage, reconcile_usage, retry_failed_events, enqueue_failed, metrics_snapshot,
)
from app.models import Account

settings = get_settings()

structlog.configure(
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.add_log_level,
        structlog.processors.JSONRenderer(),
    ],
    wrapper_class=structlog.make_filtering_bound_logger(
        getattr(logging, settings.log_level.upper(), logging.INFO)
    ),
)
logger = structlog.get_logger()


async def _run_reconcile():
    async with AsyncSessionLocal() as session:
        return await reconcile_usage(session)


async def _loop(name: str, interval: int, fn):
    """Run fn forever every `interval` seconds; an error is logged, never fatal."""
    while True:
        await asyncio.sleep(interval)
        try:
            report = await fn()
            logger.info(f"{name}_run", **{k: v for k, v in report.items() if k != "mismatches"},
                        mismatch_count=len(report.get("mismatches", [])))
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001
            logger.exception(f"{name}_error")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("starting_up", service=settings.app_name)
    await init_db()
    async with AsyncSessionLocal() as session:
        for i in range(1, 11):
            acct_id = f"acct_{i:03d}"
            result = await session.execute(
                select(Account).where(Account.account_id == acct_id)
            )
            if result.scalar_one_or_none() is None:
                session.add(
                    Account(
                        account_id=acct_id,
                        monthly_cap_cents=settings.default_monthly_cap_cents,
                    )
                )
        await session.commit()
    logger.info("db_ready")
    tasks = []
    if settings.background_jobs_enabled:
        tasks = [
            asyncio.create_task(_loop("retry_job", settings.retry_interval_seconds,
                                      lambda: retry_failed_events(AsyncSessionLocal))),
            asyncio.create_task(_loop("reconcile_job", settings.reconcile_interval_seconds, _run_reconcile)),
        ]
    yield
    logger.info("shutting_down")
    for t in tasks:
        t.cancel()
    await asyncio.gather(*tasks, return_exceptions=True)


app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    lifespan=lifespan,
)


@app.get("/health", response_model=HealthResponse)
async def health(db: AsyncSession = Depends(get_db)):
    try:
        await db.execute(text("SELECT 1"))
        db_status = "ok"
    except Exception as e:
        db_status = f"error: {e}"
    body = HealthResponse(
        status="ok" if db_status == "ok" else "degraded",
        service=settings.app_name,
        database=db_status,
    )
    return JSONResponse(status_code=200 if db_status == "ok" else 503, content=body.model_dump())


@app.post("/webhooks/calls")
async def webhook_calls(
    request: Request,
    db: AsyncSession = Depends(get_db),
    x_signature: str | None = Header(None, alias="X-Signature"),
):
    raw_body = await request.body()

    if not verify_signature(raw_body, x_signature):
        logger.warning("invalid_signature", path="/webhooks/calls")
        raise HTTPException(status_code=401, detail="Invalid or missing signature")

    if not raw_body:
        raise HTTPException(status_code=400, detail="Empty body")

    try:
        payload = json.loads(raw_body)
    except ValueError:  # JSONDecodeError and UnicodeDecodeError (bad bytes) are both ValueError
        logger.warning("malformed_json")
        raise HTTPException(status_code=400, detail="Invalid JSON")

    if b"\\u0000" in raw_body:  # Postgres JSONB cannot store NUL
        raise HTTPException(status_code=400, detail="NUL character not allowed")

    try:
        event = CallEvent.model_validate(payload)
    except ValidationError as e:
        logger.warning("validation_error", errors=e.errors(include_url=False, include_context=False, include_input=False))
        raise HTTPException(status_code=422, detail=e.errors(include_url=False, include_context=False, include_input=False))

    try:
        result = await process_event(db, event, payload)
        await db.commit()
    except Exception as exc:
        await db.rollback()
        logger.exception("processing_error", event_id=event.event_id)
        # Park it in the retry queue (own transaction) so it is not lost, then tell the sender to retry.
        try:
            await enqueue_failed(db, payload, repr(exc))
        except Exception:  # noqa: BLE001
            logger.exception("enqueue_failed_error", event_id=event.event_id)
        raise HTTPException(status_code=500, detail="Internal processing error")

    logger.info(
        "event_processed",
        event_id=event.event_id,
        event_type=event.event_type,
        account_id=event.account_id,
        status=result.get("status"),
        counted=(result.get("usage") or {}).get("added"),
    )
    return JSONResponse(status_code=200, content=result)


@app.get("/accounts/{account_id}/usage", response_model=UsageResponse)
async def account_usage(
    account_id: str = Path(..., pattern=r"^acct_[A-Za-z0-9_]{1,59}$"),
    month: str = Query(..., pattern=r"^\d{4}-(0[1-9]|1[0-2])$", description="YYYY-MM"),
    db: AsyncSession = Depends(get_db),
    x_api_key: str | None = Header(None, alias="X-API-Key"),
):
    if not verify_api_key(x_api_key):
        raise HTTPException(status_code=401, detail="Invalid or missing API key")

    data = await get_usage(db, account_id, month)
    return UsageResponse(**data)


@app.post("/admin/reconcile")
async def trigger_reconcile(
    db: AsyncSession = Depends(get_db),
    x_api_key: str | None = Header(None, alias="X-API-Key"),
):
    if not verify_api_key(x_api_key):
        raise HTTPException(status_code=401, detail="Invalid or missing API key")
    report = await reconcile_usage(db)
    logger.info("reconciliation_done", **report)
    return report


@app.post("/admin/retry")
async def trigger_retry(x_api_key: str | None = Header(None, alias="X-API-Key")):
    if not verify_api_key(x_api_key):
        raise HTTPException(status_code=401, detail="Invalid or missing API key")
    return await retry_failed_events(AsyncSessionLocal)


@app.get("/metrics")
async def metrics(db: AsyncSession = Depends(get_db)):
    return await metrics_snapshot(db)


@app.get("/")
async def root():
    return {
        "service": settings.app_name,
        "docs": "/docs",
        "health": "/health",
        "webhook": "POST /webhooks/calls",
        "usage": "GET /accounts/{account_id}/usage?month=YYYY-MM",
    }