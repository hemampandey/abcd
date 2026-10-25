"""Forecast selection and accuracy analytics.

All functions here are pure (DataFrames in, DataFrames/dicts out) so they are
easy to unit test without the API or network.

Conventions
-----------
- Times are tz-aware UTC internally; "delivery day" and "decision time" are UK
  local (Europe/London), as traders think about them.
- error_mw = actual_mw - forecast_mw. Negative error = wind under-delivered
  versus the forecast = the buyer is short and must cover the gap.
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta

import numpy as np
import pandas as pd

from .config import (
    BAND_LOOKBACK_DAYS,
    BAND_QUANTILES,
    DECISION_MONTH_FIRST,
    DECISION_MONTH_LAST,
    UK_TZ,
    WARMUP_START,
)

MIN_RATIO_FORECAST_MW = 1000.0
MIN_CALIBRATION_HOURS = 48

# --------------------------------------------------------------------------- #
# Calendar helpers
# --------------------------------------------------------------------------- #


def parse_decision_time(value: str) -> time:
    """'09:20' -> time(9, 20). Raises ValueError on bad input."""
    return datetime.strptime(value, "%H:%M").time()


def scope_delivery_days() -> list[date]:
    """Delivery days whose day-ahead purchase decision falls in the scope month."""
    first = DECISION_MONTH_FIRST + timedelta(days=1)
    last = DECISION_MONTH_LAST + timedelta(days=1)
    return [first + timedelta(days=i) for i in range((last - first).days + 1)]


def _days(first: date, last: date) -> list[date]:
    return [first + timedelta(days=i) for i in range((last - first).days + 1)]


def decision_cutoff(delivery_day: date, decision_time: time) -> pd.Timestamp:
    """The moment (UTC) the D-1 purchase decision is made for `delivery_day`."""
    local = datetime.combine(delivery_day - timedelta(days=1), decision_time, UK_TZ)
    return pd.Timestamp(local).tz_convert("UTC").as_unit("ns")


def delivery_hours(delivery_day: date) -> pd.DatetimeIndex:
    """Hourly start times (UTC) covering the UK-local delivery day (23/24/25 h)."""
    start = pd.Timestamp(datetime.combine(delivery_day, time(0), UK_TZ))
    end = pd.Timestamp(datetime.combine(delivery_day + timedelta(days=1), time(0), UK_TZ))
    return pd.date_range(start, end, freq="h", inclusive="left").tz_convert("UTC").as_unit("ns")


# --------------------------------------------------------------------------- #
# Forecast selection
# --------------------------------------------------------------------------- #


def latest_forecasts(forecasts: pd.DataFrame, targets: pd.DataFrame) -> pd.DataFrame:
    """For each (start_time, cutoff) target, pick the most recent forecast for that
    start_time whose publish_time <= cutoff. Targets with no such forecast get NaN.

    This is the core "what did we actually know at decision time" rule: it never
    looks at a forecast published after the decision.
    """
    left = targets.sort_values("cutoff").reset_index(drop=True)
    right = forecasts[["publish_time", "start_time", "forecast_mw"]].sort_values("publish_time")
    merged = pd.merge_asof(
        left,
        right,
        left_on="cutoff",
        right_on="publish_time",
        by="start_time",
        direction="backward",
        allow_exact_matches=True,
    )
    return merged.sort_values("start_time").reset_index(drop=True)


def backtest(
    forecasts: pd.DataFrame,
    actuals: pd.DataFrame,
    decision_time: time,
    days: list[date],
) -> pd.DataFrame:
    """Replay the day-ahead decision for each delivery day and score it.

    One row per delivery hour: the forecast that was latest at the D-1 cutoff,
    the actual outturn, the error and the forecast lead time.
    """
    targets = pd.concat(
        [
            pd.DataFrame(
                {
                    "delivery_date": day,
                    "start_time": delivery_hours(day),
                    "cutoff": decision_cutoff(day, decision_time),
                }
            )
            for day in days
        ],
        ignore_index=True,
    )
    out = latest_forecasts(forecasts, targets).merge(actuals, on="start_time", how="left")
    out["error_mw"] = out["actual_mw"] - out["forecast_mw"]
    out["lead_hours"] = (out["start_time"] - out["publish_time"]).dt.total_seconds() / 3600
    return out


def fit_correction(forecast: np.ndarray, actual: np.ndarray) -> tuple[float, float]:
    """Least-squares line actual ~ intercept + slope * forecast.

    Falls back to a pure scale factor (sum actual / sum forecast, no intercept) when
    the forecast barely varies or the fitted slope is not positive, so a degenerate
    window can never produce a nonsensical correction.
    """
    if len(forecast) >= 2 and np.std(forecast) > 1.0:
        slope, intercept = np.polyfit(forecast, actual, 1)
        if slope > 0:
            return float(slope), float(intercept)
    return float(actual.sum() / forecast.sum()), 0.0


def apply_correction(forecast, slope: float, intercept: float):
    """Corrected forecast, never above Elexon's and never below zero.

    Elexon's systematic error is over-forecasting at every wind level, so the
    correction only removes over-forecast; it never adds wind Elexon didn't predict.
    """
    return np.clip(np.minimum(intercept + slope * forecast, forecast), 0, None)


def add_calibration(
    bt: pd.DataFrame,
    lookback_days: int = BAND_LOOKBACK_DAYS,
    quantiles: tuple[float, float] = BAND_QUANTILES,
) -> pd.DataFrame:
    """Attach an out-of-sample, wind-level-aware calibrated forecast and P10-P90 band.

    Over-forecasting grows with wind level (small misses on calm hours, large ones
    on windy hours), so the correction is a straight line fitted on recent history
    rather than a single scale factor:

    - calibrated_mw = min(intercept + slope * forecast_mw, forecast_mw), floored at 0
    - band = calibrated_mw * [P10, P90] of hourly actual / fitted ratios in the window

    For delivery day D (decided on D-1 morning) the latest fully-settled delivery
    day is D-2, so the window is days [D-1-lookback, D-2]. No information from
    after the decision leaks into either number.
    """
    lo_q, hi_q = quantiles
    hist = bt.dropna(subset=["forecast_mw", "actual_mw"])
    rows = []
    for day in sorted(bt["delivery_date"].unique()):
        first, last = day - timedelta(days=lookback_days + 1), day - timedelta(days=2)
        w = hist[(hist["delivery_date"] >= first) & (hist["delivery_date"] <= last)]
        if len(w) < MIN_CALIBRATION_HOURS:
            rows.append((day, np.nan, np.nan, np.nan, np.nan, len(w)))
            continue
        f, a = w["forecast_mw"].to_numpy(), w["actual_mw"].to_numpy()
        slope, intercept = fit_correction(f, a)
        fitted = apply_correction(f, slope, intercept)
        # Ratios are unstable when the fitted value is near zero; skip those hours.
        ok = fitted >= MIN_RATIO_FORECAST_MW
        ratios = a[ok] / fitted[ok]
        rows.append(
            (
                day,
                slope,
                intercept,
                np.quantile(ratios, lo_q),
                np.quantile(ratios, hi_q),
                len(w),
            )
        )
    cal = pd.DataFrame(
        rows,
        columns=[
            "delivery_date",
            "slope",
            "intercept_mw",
            "ratio_lo",
            "ratio_hi",
            "calibration_hours",
        ],
    )
    out = bt.merge(cal, on="delivery_date", how="left")
    has_fit = out["slope"].notna()
    out["calibrated_mw"] = np.nan
    out.loc[has_fit, "calibrated_mw"] = apply_correction(
        out.loc[has_fit, "forecast_mw"].to_numpy(),
        out.loc[has_fit, "slope"].to_numpy(),
        out.loc[has_fit, "intercept_mw"].to_numpy(),
    )
    out["calibrated_error_mw"] = out["actual_mw"] - out["calibrated_mw"]
    out["band_low_mw"] = out["calibrated_mw"] * out["ratio_lo"]
    out["band_high_mw"] = out["calibrated_mw"] * out["ratio_hi"]
    out["in_band"] = (out["actual_mw"] >= out["band_low_mw"]) & (
        out["actual_mw"] <= out["band_high_mw"]
    )
    return out


def full_backtest(forecasts: pd.DataFrame, actuals: pd.DataFrame, decision_time: time):
    """Backtest over warm-up + scope with bands; returns only scope rows."""
    scope = scope_delivery_days()
    days = _days(WARMUP_START + timedelta(days=2), scope[-1])
    bt = add_calibration(backtest(forecasts, actuals, decision_time, days))
    return bt[bt["delivery_date"].isin(scope)].reset_index(drop=True)


# --------------------------------------------------------------------------- #
# Metrics & aggregations
# --------------------------------------------------------------------------- #


def error_metrics(df: pd.DataFrame) -> dict:
    """Headline accuracy metrics over rows that have both forecast and actual."""
    d = df.dropna(subset=["forecast_mw", "actual_mw"])
    if d.empty:
        return {"n": 0}
    err = d["error_mw"].to_numpy()
    abs_err = np.abs(err)
    mean_actual = float(d["actual_mw"].mean())
    out = {
        "n": int(len(d)),
        "mae_mw": float(abs_err.mean()),
        "rmse_mw": float(np.sqrt((err**2).mean())),
        "bias_mw": float(err.mean()),
        "nmae_pct": float(abs_err.mean() / mean_actual * 100) if mean_actual else None,
        "p50_abs_error_mw": float(np.quantile(abs_err, 0.5)),
        "p90_abs_error_mw": float(np.quantile(abs_err, 0.9)),
        "p10_error_mw": float(np.quantile(err, 0.1)),
        "p90_error_mw": float(np.quantile(err, 0.9)),
        "max_shortfall_mw": float(max(0.0, -err.min())),
        "max_surplus_mw": float(max(0.0, err.max())),
        "mean_actual_mw": mean_actual,
        "mean_forecast_mw": float(d["forecast_mw"].mean()),
    }
    if "calibrated_mw" in d:
        c = d.dropna(subset=["calibrated_mw"])
        if not c.empty:
            cal_err = c["calibrated_error_mw"].to_numpy()
            out["calibrated_mae_mw"] = float(np.abs(cal_err).mean())
            out["calibrated_bias_mw"] = float(cal_err.mean())
            out["band_coverage_pct"] = float(c["in_band"].mean() * 100)
            out["band_mean_width_mw"] = float((c["band_high_mw"] - c["band_low_mw"]).mean())
    return out


def daily_summary(bt: pd.DataFrame) -> pd.DataFrame:
    """Per delivery day: energy (MWh, hourly MW sums) and hourly error stats."""
    d = bt.dropna(subset=["forecast_mw", "actual_mw"])
    g = d.groupby("delivery_date")
    return pd.DataFrame(
        {
            "forecast_mwh": g["forecast_mw"].sum(),
            "calibrated_mwh": g["calibrated_mw"].sum(min_count=1),
            "actual_mwh": g["actual_mw"].sum(),
            "mae_mw": g["error_mw"].apply(lambda e: e.abs().mean()),
            "calibrated_mae_mw": g["calibrated_error_mw"].apply(lambda e: e.abs().mean()),
            "bias_mw": g["error_mw"].mean(),
            "max_shortfall_mw": g["error_mw"].min().mul(-1).clip(lower=0),
        }
    ).reset_index()


def by_hour_of_day(bt: pd.DataFrame) -> pd.DataFrame:
    """MAE / bias / error quantiles by UK-local hour of the delivery day."""
    d = bt.dropna(subset=["error_mw"]).copy()
    d["hour"] = d["start_time"].dt.tz_convert(UK_TZ).dt.hour
    g = d.groupby("hour")["error_mw"]
    return pd.DataFrame(
        {
            "mae_mw": g.apply(lambda e: e.abs().mean()),
            "calibrated_mae_mw": d.groupby("hour")["calibrated_error_mw"].apply(
                lambda e: e.abs().mean()
            ),
            "bias_mw": g.mean(),
            "p10_error_mw": g.quantile(0.1),
            "p90_error_mw": g.quantile(0.9),
            "mean_lead_hours": d.groupby("hour")["lead_hours"].mean(),
        }
    ).reset_index()


def error_histogram(bt: pd.DataFrame, bin_mw: int = 500) -> pd.DataFrame:
    err = bt["error_mw"].dropna()
    if err.empty:
        return pd.DataFrame(columns=["bin_start_mw", "bin_end_mw", "count"])
    lo = int(np.floor(err.min() / bin_mw) * bin_mw)
    hi = int(np.ceil(err.max() / bin_mw) * bin_mw) + bin_mw
    edges = np.arange(lo, hi + 1, bin_mw)
    counts, _ = np.histogram(err, bins=edges)
    return pd.DataFrame({"bin_start_mw": edges[:-1], "bin_end_mw": edges[1:], "count": counts})


def lead_time_profile(
    forecasts: pd.DataFrame,
    actuals: pd.DataFrame,
    days: list[date],
    bucket_hours: int = 6,
    max_hours: int = 72,
) -> pd.DataFrame:
    """How accuracy decays with forecast horizon, using every run (not just the
    one picked at decision time) for target hours in the scope delivery days."""
    hours = pd.DatetimeIndex(np.concatenate([delivery_hours(d) for d in days]))
    d = forecasts[forecasts["start_time"].isin(hours)].merge(actuals, on="start_time")
    d["lead_hours"] = (d["start_time"] - d["publish_time"]).dt.total_seconds() / 3600
    d = d[(d["lead_hours"] >= 0) & (d["lead_hours"] < max_hours)].copy()
    d["error_mw"] = d["actual_mw"] - d["forecast_mw"]
    d["bucket"] = (d["lead_hours"] // bucket_hours).astype(int) * bucket_hours
    g = d.groupby("bucket")["error_mw"]
    out = pd.DataFrame(
        {
            "mae_mw": g.apply(lambda e: e.abs().mean()),
            "bias_mw": g.mean(),
            "p90_abs_error_mw": g.apply(lambda e: e.abs().quantile(0.9)),
            "n": g.size(),
        }
    ).reset_index()
    out = out.rename(columns={"bucket": "lead_from_h"})
    out["lead_to_h"] = out["lead_from_h"] + bucket_hours
    return out


def decision_time_sensitivity(
    forecasts: pd.DataFrame,
    actuals: pd.DataFrame,
    days: list[date],
    step_minutes: int = 30,
) -> pd.DataFrame:
    """MAE of the day-ahead forecast as a function of when on D-1 you decide."""
    rows = []
    for minutes in range(0, 24 * 60, step_minutes):
        t = time(minutes // 60, minutes % 60)
        bt = backtest(forecasts, actuals, t, days)
        m = error_metrics(bt)
        rows.append({"decision_time": t.strftime("%H:%M"), "mae_mw": m.get("mae_mw")})
    return pd.DataFrame(rows)


def forecast_runs(
    forecasts: pd.DataFrame, delivery_day: date, cutoff: pd.Timestamp, used: pd.Timestamp | None
) -> list[dict]:
    """All runs published from D-2 to the end of D that cover the delivery day,
    labelled relative to the decision cutoff (used / earlier / too late)."""
    hours = delivery_hours(delivery_day)
    window_start = pd.Timestamp(
        datetime.combine(delivery_day - timedelta(days=2), time(0), UK_TZ)
    ).tz_convert("UTC")
    d = forecasts[
        forecasts["start_time"].isin(hours)
        & (forecasts["publish_time"] >= window_start)
        & (forecasts["publish_time"] < hours[-1] + pd.Timedelta(hours=1))
    ]
    runs = []
    for publish_time, g in d.groupby("publish_time"):
        if used is not None and publish_time == used:
            status = "used"
        elif publish_time <= cutoff:
            status = "earlier"
        else:
            status = "after_cutoff"
        runs.append(
            {
                "publish_time": publish_time,
                "status": status,
                "points": [
                    {"start_time": s, "forecast_mw": f}
                    for s, f in zip(g["start_time"], g["forecast_mw"], strict=True)
                ],
            }
        )
    return runs
