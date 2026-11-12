from conftest import API_KEY


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["database"] == "ok"


def test_bad_signature_rejected(send, make_event, account_id):
    r = send(make_event(account_id), signature="deadbeef")
    assert r.status_code == 401


def test_missing_signature_rejected(client, make_event, account_id):
    r = client.post("/webhooks/calls", json=make_event(account_id))
    assert r.status_code == 401


def test_usage_requires_api_key(client, account_id):
    r = client.get(f"/accounts/{account_id}/usage", params={"month": "2026-11"})
    assert r.status_code == 401
    r = client.get(f"/accounts/{account_id}/usage", params={"month": "2026-11"},
            headers={"X-API-Key": "wrong"})
    assert r.status_code == 401


def test_event_is_counted(send, usage, make_event, account_id):
    r = send(make_event(account_id, duration=125, cost=42))
    assert r.status_code == 200
    u = usage(account_id).json()
    assert u["total_cost_cents"] == 42
    assert u["call_count"] == 1
    assert u["total_minutes"] == 2


def test_duplicate_event_not_double_counted(send, usage, make_event, account_id):
    ev = make_event(account_id, cost=42)
    assert send(ev).json()["status"] == "processed"
    assert send(ev).json()["status"] == "duplicate"
    u = usage(account_id).json()
    assert u["total_cost_cents"] == 42
    assert u["call_count"] == 1


def test_out_of_order_started_after_ended(send, usage, make_event, account_id):
    call_id = "call_ooo_" + account_id
    send(make_event(account_id, call_id=call_id, event_type="call.ended", cost=10))
    send(make_event(account_id, call_id=call_id, event_type="call.started",
                    duration=0, cost=0, ts="2026-11-10T06:59:00Z"))
    u = usage(account_id).json()
    assert u["total_cost_cents"] == 10
    assert u["call_count"] == 1


def test_over_cap_event_rejected(send, usage, make_event, account_id):
    send(make_event(account_id, cost=9000))
    r = send(make_event(account_id, cost=2000))
    assert r.json()["usage"]["reason"] == "would_exceed_cap"
    u = usage(account_id).json()
    assert u["total_cost_cents"] == 9000
    assert u["over_cap"] is True


def _reconcile(client):
    return client.post("/admin/reconcile", headers={"X-API-Key": API_KEY})


def test_reconcile_ignores_rejected_events(client, send, usage, make_event, account_id):
    send(make_event(account_id, cost=9000))
    send(make_event(account_id, cost=2000))          # rejected by cap
    before = usage(account_id).json()
    rep = _reconcile(client).json()
    assert not [m for m in rep["mismatches"] if m["account_id"] == account_id]
    assert usage(account_id).json() == before


def test_reconcile_minutes_floor_per_call(client, send, usage, make_event, account_id):
    send(make_event(account_id, duration=90, cost=5))
    send(make_event(account_id, duration=90, cost=5))
    before = usage(account_id).json()
    assert before["total_minutes"] == 2
    rep = _reconcile(client).json()
    assert not [m for m in rep["mismatches"] if m["account_id"] == account_id]
    assert usage(account_id).json() == before


def test_reconcile_zero_cost_call(client, send, usage, make_event, account_id):
    send(make_event(account_id, cost=0))
    send(make_event(account_id, cost=7))
    rep = _reconcile(client).json()
    assert not [m for m in rep["mismatches"] if m["account_id"] == account_id]

def test_month_bucketed_in_utc(client, send, usage, make_event, account_id):
    # 01:00 on Dec 1 in IST (+05:30) is still Nov 30 in UTC
    ev = make_event(account_id, cost=5, ts="2026-12-01T01:00:00+05:30")
    send(ev)
    assert usage(account_id, month="2026-11").json()["call_count"] == 1
    assert usage(account_id, month="2026-12").json()["call_count"] == 0
    rep = client.post("/admin/reconcile", headers={"X-API-Key": API_KEY}).json()
    assert not [m for m in rep["mismatches"] if m["account_id"] == account_id]