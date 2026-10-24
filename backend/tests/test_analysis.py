from datetime import date, time, timedelta

import numpy as np
import pandas as pd
import pytest

from app import analysis as an


def ts(s: str) -> pd.Timestamp:
    return pd.Timestamp(s, tz="UTC").as_unit("ns")


def make_forecasts(rows: list[tuple[str, str, float]]) -> pd.DataFrame:
    return pd.DataFrame(
        {
            "publish_time": [ts(p) for p, _, _ in rows],
            "start_time": [ts(s) for _, s, _ in rows],
            "forecast_mw": [f for _, _, f in rows],
        }
    )


# --- calendar --------------------------------------------------------------- #


def test_scope_is_deliveries_for_january_decisions():
    days = an.scope_delivery_days()
    assert days[0] == date(2026, 1, 2)
    assert days[-1] == date(2026, 2, 1)
    assert len(days) == 31


def test_decision_cutoff_is_uk_local_on_previous_day():
    # Winter: UK local == UTC
    assert an.decision_cutoff(date(2026, 1, 15), time(9, 20)) == ts("2026-01-14T09:20")
    # Summer: BST = UTC+1
    assert an.decision_cutoff(date(2026, 7, 15), time(9, 20)) == ts("2026-07-14T08:20")


@pytest.mark.parametrize(
    ("day", "hours"),
    [(date(2026, 1, 15), 24), (date(2026, 3, 29), 23), (date(2026, 10, 25), 25)],
)
def test_delivery_hours_respect_clock_changes(day, hours):
    assert len(an.delivery_hours(day)) == hours


def test_parse_decision_time_rejects_garbage():
    assert an.parse_decision_time("09:50") == time(9, 50)
    with pytest.raises(ValueError):
        an.parse_decision_time("9.50am")


# --- forecast selection ----------------------------------------------------- #


def test_latest_forecast_never_uses_runs_published_after_cutoff():
    fc = make_forecasts(
        [
            ("2026-01-14T04:30", "2026-01-15T12:00", 100.0),
            ("2026-01-14T07:30", "2026-01-15T12:00", 200.0),  # latest before cutoff
            ("2026-01-14T09:30", "2026-01-15T12:00", 999.0),  # after cutoff
        ]
    )
    targets = pd.DataFrame(
        {"start_time": [ts("2026-01-15T12:00")], "cutoff": [ts("2026-01-14T09:20")]}
    )
    out = an.latest_forecasts(fc, targets)
    assert out.loc[0, "forecast_mw"] == 200.0
    assert out.loc[0, "publish_time"] == ts("2026-01-14T07:30")


def test_forecast_published_exactly_at_cutoff_is_usable():
    fc = make_forecasts([("2026-01-14T09:30", "2026-01-15T12:00", 5.0)])
    targets = pd.DataFrame(
        {"start_time": [ts("2026-01-15T12:00")], "cutoff": [ts("2026-01-14T09:30")]}
    )
    assert an.latest_forecasts(fc, targets).loc[0, "forecast_mw"] == 5.0


def test_missing_forecast_gives_nan_not_a_neighbouring_hour():
    fc = make_forecasts([("2026-01-14T07:30", "2026-01-15T13:00", 5.0)])
    targets = pd.DataFrame(
        {"start_time": [ts("2026-01-15T12:00")], "cutoff": [ts("2026-01-14T09:20")]}
    )
    assert np.isnan(an.latest_forecasts(fc, targets).loc[0, "forecast_mw"])


def test_backtest_error_sign_and_lead_time():
    day = date(2026, 1, 15)
    hours = an.delivery_hours(day)
    fc = pd.DataFrame(
        {"publish_time": ts("2026-01-14T07:30"), "start_time": hours, "forecast_mw": 1000.0}
    )
    act = pd.DataFrame({"start_time": hours, "actual_mw": 800.0})
    bt = an.backtest(fc, act, time(9, 20), [day])
    assert len(bt) == 24
    assert (bt["error_mw"] == -200.0).all()  # wind under-delivered -> negative
    assert bt["lead_hours"].iloc[0] == pytest.approx(16.5)


# --- calibration ------------------------------------------------------------ #


def _synthetic_backtest(days: list[date], ratio: float) -> pd.DataFrame:
    frames = []
    for d in days:
        hours = an.delivery_hours(d)
        frames.append(
            pd.DataFrame(
                {
                    "delivery_date": d,
                    "start_time": hours,
                    "forecast_mw": 10_000.0,
                    "actual_mw": 10_000.0 * ratio,
                }
            )
        )
    bt = pd.concat(frames, ignore_index=True)
    bt["error_mw"] = bt["actual_mw"] - bt["forecast_mw"]
    return bt


def test_calibration_learns_scale_from_history():
    days = [date(2026, 1, 1) + timedelta(days=i) for i in range(20)]
    out = an.add_calibration(_synthetic_backtest(days, 0.8), lookback_days=14)
    last = out[out["delivery_date"] == days[-1]]
    assert last["scale"].iloc[0] == pytest.approx(0.8)
    assert last["calibrated_mw"].iloc[0] == pytest.approx(8000.0)


def test_calibration_does_not_leak_d_minus_1_or_d():
    days = [date(2026, 1, 1) + timedelta(days=i) for i in range(20)]
    bt = _synthetic_backtest(days, 0.8)
    target = days[-1]
    # Corrupt the two days a trader could not have seen settled at decision time.
    leak = bt["delivery_date"].isin([target, target - timedelta(days=1)])
    bt.loc[leak, "actual_mw"] = 99_999.0
    out = an.add_calibration(bt, lookback_days=14)
    assert out.loc[out["delivery_date"] == target, "scale"].iloc[0] == pytest.approx(0.8)


def test_calibration_needs_enough_history():
    days = [date(2026, 1, 1) + timedelta(days=i) for i in range(3)]
    out = an.add_calibration(_synthetic_backtest(days, 0.8), lookback_days=14)
    assert out.loc[out["delivery_date"] == days[0], "calibrated_mw"].isna().all()


# --- metrics ---------------------------------------------------------------- #


def test_error_metrics_known_values():
    df = pd.DataFrame(
        {
            "forecast_mw": [100.0, 100.0, 100.0, 100.0],
            "actual_mw": [90.0, 110.0, 70.0, 130.0],
        }
    )
    df["error_mw"] = df["actual_mw"] - df["forecast_mw"]
    m = an.error_metrics(df)
    assert m["n"] == 4
    assert m["mae_mw"] == pytest.approx(20.0)
    assert m["rmse_mw"] == pytest.approx(np.sqrt((100 + 100 + 900 + 900) / 4))
    assert m["bias_mw"] == pytest.approx(0.0)
    assert m["max_shortfall_mw"] == 30.0
    assert m["nmae_pct"] == pytest.approx(20.0)


def test_error_metrics_empty():
    df = pd.DataFrame({"forecast_mw": [np.nan], "actual_mw": [1.0], "error_mw": [np.nan]})
    assert an.error_metrics(df) == {"n": 0}


def test_histogram_counts_every_error():
    bt = pd.DataFrame({"error_mw": [-1200.0, -10.0, 0.0, 499.0, 501.0]})
    h = an.error_histogram(bt, bin_mw=500)
    assert h["count"].sum() == 5


def test_lead_time_profile_ignores_backcasts():
    day = date(2026, 1, 15)
    hours = an.delivery_hours(day)
    fc = pd.concat(
        [
            # Published after the target hour (negative lead): must be ignored.
            pd.DataFrame(
                {"publish_time": ts("2026-01-16T02:30"), "start_time": hours, "forecast_mw": 0.0}
            ),
            pd.DataFrame(
                {"publish_time": ts("2026-01-14T07:30"), "start_time": hours, "forecast_mw": 100.0}
            ),
        ]
    )
    act = pd.DataFrame({"start_time": hours, "actual_mw": 100.0})
    prof = an.lead_time_profile(fc, act, [day])
    assert prof["n"].sum() == 24
    assert (prof["mae_mw"] == 0).all()
