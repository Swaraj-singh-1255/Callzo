# Usage Metering Service

FastAPI + PostgreSQL service that ingests call webhooks, tracks per-account
monthly usage, and enforces a monthly spend cap.

## Run

    cp .env.example .env        # then fill in real secrets
    docker compose up --build -d
    # API: http://localhost:8000  Docs: http://localhost:8000/docs

Generate secrets with:

    python -c "import secrets; print(secrets.token_hex(32))"

Run the tests (the stack must be up; load `.env` into your shell first):

    python -m venv .venv && .venv\Scripts\Activate.ps1
    pip install pytest httpx
    pytest tests -v

## Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | /health | none | Liveness and DB check |
| POST | /webhooks/calls | X-Signature | Ingest a call event |
| GET | /accounts/{account_id}/usage?month=YYYY-MM | X-API-Key | Monthly usage and cap status |
| POST | /admin/reconcile | X-API-Key | Recompute totals from stored events |

`X-Signature` is the hex HMAC-SHA256 of the raw request body, keyed with
`WEBHOOK_SECRET`. Account IDs must start with `acct_` on the usage endpoint.

## Design decisions

- **Idempotency:** events are deduplicated by `event_id` (unique insert,
  `ON CONFLICT DO NOTHING`). A replay returns `status: duplicate`.
- **Out-of-order events:** `call.ended` can arrive before `call.started`;
  the call row is created from whichever arrives first, and a late
  `call.started` never changes usage.
- **Billing:** only `call.ended` events with cost > 0 are counted.
- **Hard monthly cap:** an event that would push the total past the cap is
  stored for audit (`processed=false`) but not counted. `over_cap: true`
  means the cap was reached or an event was blocked this month.
- **Minutes** are floored per call. **Months** are bucketed in UTC.
- **Reconcile** recomputes totals from processed `call.ended` events
  (cost > 0) and corrects any stored totals that differ.

## Known limitations

- Idempotency is by `event_id` only; two different event IDs for the same
  call would both be billed.
- Two simultaneous first events of a month for one account could race when
  creating the usage row (fixable with `INSERT ... ON CONFLICT`).
- The webhook simulator image is not available for this platform, so the
  service was tested with the included test suite instead.
- DB credentials in `docker-compose.yml` are local development defaults.