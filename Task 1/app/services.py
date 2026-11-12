from datetime import datetime, timedelta, timezone
from typing import Optional

import structlog
from sqlalchemy import select, text, update, func
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import Account, Call, Event, FailedEvent, UsageMonthly
from app.schemas import CallEvent

logger = structlog.get_logger()
settings = get_settings()


def month_from_timestamp(ts: datetime) -> str:
    """Usage month is decided by the EVENT timestamp (UTC), never by arrival time."""
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    return ts.astimezone(timezone.utc).strftime("%Y-%m")


def is_late(ts: datetime, now: Optional[datetime] = None) -> bool:
    now = now or datetime.now(timezone.utc)
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    return (now - ts) > timedelta(days=settings.late_event_threshold_days)


async def ensure_account(session: AsyncSession, account_id: str) -> Account:
    # INSERT .. ON CONFLICT DO NOTHING so two concurrent first events cannot collide
    await session.execute(
        insert(Account)
        .values(account_id=account_id, monthly_cap_cents=settings.default_monthly_cap_cents, is_blocked=False)
        .on_conflict_do_nothing(index_elements=["account_id"])
    )
    result = await session.execute(select(Account).where(Account.account_id == account_id))
    return result.scalar_one()


async def process_event(session: AsyncSession, event: CallEvent, raw_payload: dict) -> dict:
    """Apply one validated event. Caller owns the transaction (commit / rollback).

    Everything below - event log insert, call upsert, usage update - happens in
    ONE transaction, so a crash can never leave an event logged but not counted.
    """
    late = is_late(event.timestamp)
    stmt = insert(Event).values(
        event_id=event.event_id,
        event_type=event.event_type,
        account_id=event.account_id,
        call_id=event.call_id,
        event_timestamp=event.timestamp,
        duration_seconds=event.duration_seconds,
        cost_cents=event.cost_cents,
        destination_country=event.destination_country,
        raw_payload=raw_payload,
        processed=True,
        is_late=late,
    ).on_conflict_do_nothing(index_elements=["event_id"])

    result = await session.execute(stmt)
    if result.rowcount == 0:
        logger.info("duplicate_event", event_id=event.event_id)
        return {"status": "duplicate", "event_id": event.event_id}

    if late:
        logger.warning(
            "late_event",
            event_id=event.event_id,
            event_timestamp=event.timestamp.isoformat(),
            attributed_month=month_from_timestamp(event.timestamp),
        )

    account = await ensure_account(session, event.account_id)
    call = await _upsert_call(session, event)

    if event.event_type == "call.ended" and event.cost_cents > 0:
        # A call is billed at most once, even if two DIFFERENT event_ids carry its call.ended.
        if call.counted:
            await _mark_not_counted(session, event.event_id)
            return {"status": "processed", "event_id": event.event_id,
                    "usage": {"added": False, "reason": "call_already_billed"}}

        month = month_from_timestamp(event.timestamp)
        usage_result = await _update_usage(
            session,
            account_id=event.account_id,
            month=month,
            duration_seconds=event.duration_seconds,
            cost_cents=event.cost_cents,
            cap_cents=account.monthly_cap_cents,
        )
        if usage_result["added"]:
            call.counted = True
        else:
            await _mark_not_counted(session, event.event_id)

        return {"status": "processed", "event_id": event.event_id, "usage": usage_result, "late": late}

    return {"status": "processed", "event_id": event.event_id}


async def _mark_not_counted(session: AsyncSession, event_id: str) -> None:
    await session.execute(update(Event).where(Event.event_id == event_id).values(processed=False))


async def _upsert_call(session: AsyncSession, event: CallEvent) -> Call:
    """Create-or-update the call row so ended-before-started still converges."""
    existing = await session.execute(
        select(Call).where(Call.call_id == event.call_id).with_for_update()
    )
    call = existing.scalar_one_or_none()

    if call is None:
        # Concurrent first events for the same call: let the DB arbitrate.
        await session.execute(
            insert(Call)
            .values(call_id=event.call_id, account_id=event.account_id, status="unknown",
                    duration_seconds=0, cost_cents=0, counted=False)
            .on_conflict_do_nothing(index_elements=["call_id"])
        )
        existing = await session.execute(
            select(Call).where(Call.call_id == event.call_id).with_for_update()
        )
        call = existing.scalar_one()

    if event.event_type == "call.started":
        call.started_at = event.timestamp
        if call.status == "unknown":
            call.status = "started"
    elif event.event_type == "call.ended":
        call.ended_at = event.timestamp
        call.duration_seconds = event.duration_seconds
        call.cost_cents = event.cost_cents
        call.status = "ended"
    elif event.event_type == "call.failed":
        call.ended_at = event.timestamp
        if call.status != "ended":  # a failure never downgrades a completed call
            call.status = "failed"
    if event.destination_country:
        call.destination_country = event.destination_country
    call.updated_at = datetime.now(timezone.utc)
    await session.flush()
    return call


async def _lock_usage_row(session: AsyncSession, account_id: str, month: str) -> UsageMonthly:
    """Create the (account, month) row if needed, then lock it for the rest of the transaction.

    INSERT .. ON CONFLICT DO NOTHING removes the 'two first events race' bug;
    SELECT .. FOR UPDATE serialises all writers for one account+month, so 40
    simultaneous calls cannot slip past the cap.
    """
    await session.execute(
        insert(UsageMonthly)
        .values(account_id=account_id, month=month, total_minutes=0,
                total_cost_cents=0, call_count=0, over_cap=False)
        .on_conflict_do_nothing(index_elements=["account_id", "month"])
    )
    result = await session.execute(
        select(UsageMonthly)
        .where(UsageMonthly.account_id == account_id, UsageMonthly.month == month)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    return result.scalar_one()


async def _update_usage(
    session: AsyncSession,
    account_id: str,
    month: str,
    duration_seconds: int,
    cost_cents: int,
    cap_cents: int,
) -> dict:
    """HARD cap. total == cap is allowed; anything that would push total > cap is rejected."""
    usage = await _lock_usage_row(session, account_id, month)
    new_cost = usage.total_cost_cents + cost_cents

    if new_cost > cap_cents:
        usage.over_cap = True
        await session.flush()
        return {"added": False, "reason": "would_exceed_cap",
                "total_cost_cents": usage.total_cost_cents, "over_cap": True}

    usage.total_minutes += duration_seconds // 60
    usage.total_cost_cents = new_cost
    usage.call_count += 1
    if new_cost == cap_cents:
        usage.over_cap = True  # cap reached: next billable call is blocked
    usage.updated_at = datetime.now(timezone.utc)
    await session.flush()
    return {"added": True, "total_cost_cents": usage.total_cost_cents, "over_cap": usage.over_cap}


async def get_usage(session: AsyncSession, account_id: str, month: str) -> dict:
    usage = (await session.execute(
        select(UsageMonthly).where(UsageMonthly.account_id == account_id, UsageMonthly.month == month)
    )).scalar_one_or_none()
    account = (await session.execute(
        select(Account).where(Account.account_id == account_id)
    )).scalar_one_or_none()
    cap = account.monthly_cap_cents if account else settings.default_monthly_cap_cents

    late_count = (await session.execute(text("""
        SELECT COUNT(*) FROM events
        WHERE account_id = :a AND is_late AND processed AND event_type = 'call.ended' AND cost_cents > 0
          AND to_char(event_timestamp AT TIME ZONE 'UTC', 'YYYY-MM') = :m
    """), {"a": account_id, "m": month})).scalar_one()

    if usage is None:
        return {"account_id": account_id, "month": month, "total_minutes": 0, "total_cost_cents": 0,
                "call_count": 0, "over_cap": False, "late_event_count": late_count,
                "monthly_cap_cents": cap, "remaining_cents": cap}
    return {
        "account_id": account_id, "month": month,
        "total_minutes": usage.total_minutes,
        "total_cost_cents": usage.total_cost_cents,
        "call_count": usage.call_count,
        "over_cap": usage.over_cap,
        "late_event_count": late_count,
        "monthly_cap_cents": cap,
        "remaining_cents": max(0, cap - usage.total_cost_cents),
    }


# --------------------------------------------------------------------------
# Failed-event queue + retry job
# --------------------------------------------------------------------------
async def enqueue_failed(session: AsyncSession, payload: dict, error: str) -> None:
    """Persist an event that failed to process so the retry job can pick it up."""
    session.add(FailedEvent(
        event_id=str(payload.get("event_id"))[:64] if isinstance(payload, dict) else None,
        payload=payload, error=error[:2000], attempts=1, status="pending",
        next_retry_at=datetime.now(timezone.utc) + timedelta(seconds=settings.retry_interval_seconds),
    ))
    await session.commit()


async def retry_failed_events(session_factory, batch_size: int = 50) -> dict:
    """Re-run failed events. Safe to run repeatedly: processing is idempotent on event_id."""
    report = {"picked": 0, "succeeded": 0, "failed": 0, "dead": 0}
    async with session_factory() as session:
        rows = (await session.execute(
            select(FailedEvent)
            .where(FailedEvent.status == "pending", FailedEvent.next_retry_at <= datetime.now(timezone.utc))
            .order_by(FailedEvent.id)
            .limit(batch_size)
            .with_for_update(skip_locked=True)
        )).scalars().all()
        ids = [(r.id, r.payload) for r in rows]
    report["picked"] = len(ids)

    for fid, payload in ids:
        async with session_factory() as session:
            row = (await session.execute(
                select(FailedEvent).where(FailedEvent.id == fid).with_for_update(skip_locked=True)
            )).scalar_one_or_none()
            if row is None or row.status != "pending":
                continue
            try:
                event = CallEvent.model_validate(payload)
                await process_event(session, event, payload)
                row.status = "done"
                row.updated_at = datetime.now(timezone.utc)
                await session.commit()
                report["succeeded"] += 1
                logger.info("retry_succeeded", failed_event_id=fid, event_id=event.event_id)
            except Exception as exc:  # noqa: BLE001 - job must never die
                await session.rollback()
                async with session_factory() as s2:
                    r2 = (await s2.execute(select(FailedEvent).where(FailedEvent.id == fid))).scalar_one()
                    r2.attempts += 1
                    r2.error = repr(exc)[:2000]
                    if r2.attempts >= settings.retry_max_attempts:
                        r2.status = "dead"
                        report["dead"] += 1
                        logger.error("retry_gave_up", failed_event_id=fid, attempts=r2.attempts)
                    else:
                        backoff = settings.retry_interval_seconds * (2 ** (r2.attempts - 1))
                        r2.next_retry_at = datetime.now(timezone.utc) + timedelta(seconds=backoff)
                        report["failed"] += 1
                    await s2.commit()
    return report


# --------------------------------------------------------------------------
# Reconciliation
# --------------------------------------------------------------------------
async def reconcile_usage(session: AsyncSession) -> dict:
    """Recompute usage_monthly from the raw events log and fix any drift.

    Source of truth = events with processed=true, call.ended, cost>0.
    Each (account, month) is recomputed while holding the same row lock the
    webhook path uses, so reconciliation cannot race a concurrent webhook.
    """
    keys = (await session.execute(text("""
        SELECT account_id, to_char(event_timestamp AT TIME ZONE 'UTC', 'YYYY-MM') AS month
        FROM events WHERE event_type = 'call.ended' AND processed = true AND cost_cents > 0
        UNION
        SELECT account_id, month FROM usage_monthly
    """))).fetchall()

    report = {"checked": 0, "mismatches": [], "fixed": 0}
    await session.rollback()  # end the read transaction; each key gets its own short one

    for account_id, month in keys:
        report["checked"] += 1
        usage = await _lock_usage_row(session, account_id, month)
        row = (await session.execute(text("""
            SELECT COALESCE(SUM(duration_seconds / 60), 0)::int,
                   COALESCE(SUM(cost_cents), 0)::int,
                   COUNT(*)::int
            FROM events
            WHERE account_id = :a AND event_type = 'call.ended' AND processed = true AND cost_cents > 0
              AND to_char(event_timestamp AT TIME ZONE 'UTC', 'YYYY-MM') = :m
        """), {"a": account_id, "m": month})).one()
        minutes, cost, calls = row

        stored = (usage.total_minutes, usage.total_cost_cents, usage.call_count)
        if stored != (minutes, cost, calls):
            report["mismatches"].append({
                "account_id": account_id, "month": month,
                "stored": {"minutes": stored[0], "cost": stored[1], "calls": stored[2]},
                "recomputed": {"minutes": minutes, "cost": cost, "calls": calls},
            })
            usage.total_minutes, usage.total_cost_cents, usage.call_count = minutes, cost, calls
            usage.updated_at = datetime.now(timezone.utc)
            report["fixed"] += 1
        await session.commit()  # releases the row lock

    return report


async def metrics_snapshot(session: AsyncSession) -> dict:
    ev = (await session.execute(text("""
        SELECT COUNT(*)::int,
               COUNT(*) FILTER (WHERE NOT processed)::int,
               COUNT(*) FILTER (WHERE is_late)::int
        FROM events"""))).one()
    fq = (await session.execute(text(
        "SELECT status, COUNT(*)::int FROM failed_events GROUP BY status"))).fetchall()
    return {
        "events_total": ev[0],
        "events_not_counted": ev[1],
        "events_late": ev[2],
        "failed_events": {status: n for status, n in fq},
    }
