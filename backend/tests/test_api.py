"""API tests against the bundled January 2026 snapshot (no network)."""

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health():
    assert client.get("/api/health").json() == {"status": "ok"}


def test_meta_lists_scope_and_auction_presets():
    body = client.get("/api/meta").json()
    assert body["delivery_days"][0] == "2026-01-02"
    assert body["delivery_days"][-1] == "2026-02-01"
    assert {p["time"] for p in body["decision_presets"]} == {"09:20", "09:50"}


@pytest.mark.parametrize(
    ("decision_time", "expected_run"),
    [
        ("09:20", "2026-01-14T07:30:00Z"),  # EPEX gate: 09:30 run not out yet
        ("09:50", "2026-01-14T09:30:00Z"),  # N2EX gate: 09:30 run available
    ],
)
def test_day_uses_latest_run_before_gate_closure(decision_time, expected_run):
    body = client.get(f"/api/day/2026-01-15?decision_time={decision_time}").json()
    assert body["forecast_publish_time"] == expected_run
    assert len(body["hours"]) == 24
    statuses = {r["publish_time"]: r["status"] for r in body["runs"]}
    assert statuses[expected_run] == "used"
    assert all(s == "after_cutoff" for p, s in statuses.items() if p > expected_run)


def test_day_band_brackets_calibrated_forecast():
    body = client.get("/api/day/2026-01-20").json()
    for h in body["hours"]:
        assert h["band_low_mw"] <= h["calibrated_mw"] <= h["band_high_mw"]


def test_accuracy_full_month():
    body = client.get("/api/accuracy?decision_time=09:20").json()
    m = body["metrics"]
    assert m["n"] == 31 * 24
    assert len(body["daily"]) == 31
    assert len(body["by_hour"]) == 24
    assert len(body["decision_time_sensitivity"]) == 48
    # The out-of-sample P10-P90 band should cover roughly 80% of outcomes.
    assert 70 <= m["band_coverage_pct"] <= 90


def test_accuracy_date_filter():
    body = client.get("/api/accuracy?date_from=2026-01-10&date_to=2026-01-12").json()
    assert body["metrics"]["n"] == 3 * 24


@pytest.mark.parametrize(
    "url",
    [
        "/api/day/2026-03-01",
        "/api/day/2026-01-15?decision_time=25:00",
        "/api/accuracy?date_from=2026-01-20&date_to=2026-01-10",
        "/api/accuracy?decision_time=9am",
    ],
)
def test_bad_input_is_rejected(url):
    assert client.get(url).status_code == 422
