"""Glue between the data store, the analysis functions and the API shapes.

Backtests are cached per decision time: the data is historical and immutable,
so each (decision_time) result is computed once per process.
"""

from __future__ import annotations

import math
from datetime import date, time, timedelta
from functools import lru_cache

import pandas as pd

from . import analysis as an
from . import store
from .config import BAND_LOOKBACK_DAYS, UK_TZ


def _clean(value):
    """JSON-friendly scalar: NaN -> None, numpy -> python, Timestamp -> datetime."""
    if value is None:
        return None
    if isinstance(value, pd.Timestamp):
        return value.to_pydatetime()
    if hasattr(value, "item"):
        value = value.item()
    if isinstance(value, float) and math.isnan(value):
        return None
    return value


def _records(df: pd.DataFrame) -> list[dict]:
    return [{k: _clean(v) for k, v in row.items()} for row in df.to_dict("records")]


@lru_cache(maxsize=48)
def scope_backtest(decision_time: time) -> pd.DataFrame:
    ds = store.load()
    return an.full_backtest(ds.forecasts, ds.actuals, decision_time)


@lru_cache(maxsize=8)
def _lead_time(days: tuple[date, ...]) -> list[dict]:
    ds = store.load()
    return _records(an.lead_time_profile(ds.forecasts, ds.actuals, list(days)))


@lru_cache(maxsize=8)
def _sensitivity(days: tuple[date, ...]) -> list[dict]:
    ds = store.load()
    return _records(an.decision_time_sensitivity(ds.forecasts, ds.actuals, list(days)))


def day_view(delivery_day: date, decision_time: time) -> dict:
    bt = scope_backtest(decision_time)
    d = bt[bt["delivery_date"] == delivery_day]
    cutoff = an.decision_cutoff(delivery_day, decision_time)
    used = d["publish_time"].dropna()
    used_publish = used.max() if not used.empty else None
    first = d.iloc[0] if not d.empty else None

    def total(col: str):
        return _clean(d[col].sum(min_count=len(d))) if not d.empty else None

    hours = d.assign(
        local_time=d["start_time"].dt.tz_convert(UK_TZ).dt.strftime("%H:%M"),
    )[
        [
            "start_time",
            "local_time",
            "forecast_mw",
            "calibrated_mw",
            "band_low_mw",
            "band_high_mw",
            "actual_mw",
            "error_mw",
            "lead_hours",
        ]
    ]
    err = d["error_mw"].dropna()
    cal_err = d["calibrated_error_mw"].dropna()
    ds = store.load()
    return {
        "delivery_date": delivery_day,
        "decision_time": decision_time.strftime("%H:%M"),
        "decision_cutoff": cutoff.tz_convert(UK_TZ).to_pydatetime(),
        "forecast_publish_time": _clean(used_publish),
        "calibration": {
            "scale": _clean(first["scale"]) if first is not None else None,
            "ratio_low": _clean(first["ratio_lo"]) if first is not None else None,
            "ratio_high": _clean(first["ratio_hi"]) if first is not None else None,
            "hours": int(first["calibration_hours"]) if first is not None else 0,
            "window_from": delivery_day - timedelta(days=BAND_LOOKBACK_DAYS + 1),
            "window_to": delivery_day - timedelta(days=2),
        },
        "summary": {
            "forecast_mwh": float(d["forecast_mw"].sum()),
            "calibrated_mwh": total("calibrated_mw"),
            "low_case_mwh": total("band_low_mw"),
            "high_case_mwh": total("band_high_mw"),
            "actual_mwh": total("actual_mw"),
            "peak_forecast_mw": float(d["forecast_mw"].max()),
            "min_forecast_mw": float(d["forecast_mw"].min()),
            "mae_mw": _clean(err.abs().mean()) if not err.empty else None,
            "calibrated_mae_mw": _clean(cal_err.abs().mean()) if not cal_err.empty else None,
            "max_shortfall_mw": _clean(max(0.0, -err.min())) if not err.empty else None,
        },
        "hours": _records(hours),
        "runs": an.forecast_runs(ds.forecasts, delivery_day, cutoff, used_publish),
    }


def accuracy_view(decision_time: time, date_from: date, date_to: date) -> dict:
    bt = scope_backtest(decision_time)
    bt = bt[(bt["delivery_date"] >= date_from) & (bt["delivery_date"] <= date_to)]
    days = tuple(sorted(bt["delivery_date"].unique()))
    return {
        "decision_time": decision_time.strftime("%H:%M"),
        "date_from": date_from,
        "date_to": date_to,
        "metrics": {k: _clean(v) for k, v in an.error_metrics(bt).items()},
        "daily": _records(an.daily_summary(bt)),
        "by_hour": _records(an.by_hour_of_day(bt)),
        "histogram": _records(an.error_histogram(bt)),
        "lead_time": _lead_time(days),
        "decision_time_sensitivity": _sensitivity(days),
    }
