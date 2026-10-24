"""Data access: a versioned snapshot on disk, refreshable from Elexon.

January 2026 is history, so the app ships a gzipped snapshot of the raw API
rows. That keeps cold starts fast (important on serverless hosting) and keeps
the app working if Elexon is slow or down. `python -m app.ingest` rebuilds it.
"""

from __future__ import annotations

import gzip
import json
import logging
from dataclasses import dataclass
from datetime import datetime, time, timedelta
from functools import lru_cache
from pathlib import Path

import pandas as pd

from . import elexon
from .config import (
    ACTUAL_SNAPSHOT,
    DECISION_MONTH_LAST,
    FORECAST_SNAPSHOT,
    UK_TZ,
    WARMUP_START,
)

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class Dataset:
    forecasts: pd.DataFrame  # publish_time, start_time, forecast_mw (hourly targets)
    actuals: pd.DataFrame  # start_time, actual_mw (hourly mean of the two half-hours)
    refreshed_at: str


def fetch_window() -> tuple[datetime, datetime]:
    """Publish-time window to download: warm-up start to end of last delivery day."""
    start = datetime.combine(WARMUP_START, time(0), UK_TZ)
    end = datetime.combine(DECISION_MONTH_LAST + timedelta(days=2), time(0), UK_TZ)
    return start, end


def download() -> tuple[list[dict], list[dict]]:
    start, end = fetch_window()
    forecasts = elexon.fetch_wind_forecasts(start, end)
    actuals = elexon.fetch_wind_actuals(start.date(), end.date())
    return forecasts, actuals


def write_snapshot(forecasts: list[dict], actuals: list[dict]) -> None:
    meta = {"refreshedAt": datetime.now(UK_TZ).isoformat(timespec="seconds")}
    for path, rows in ((FORECAST_SNAPSHOT, forecasts), (ACTUAL_SNAPSHOT, actuals)):
        path.parent.mkdir(parents=True, exist_ok=True)
        with gzip.open(path, "wt", encoding="utf-8") as fh:
            json.dump({**meta, "rows": rows}, fh, separators=(",", ":"))
        log.info("wrote %d rows to %s", len(rows), path)


def _read(path: Path) -> tuple[list[dict], str]:
    with gzip.open(path, "rt", encoding="utf-8") as fh:
        payload = json.load(fh)
    return payload["rows"], payload.get("refreshedAt", "")


def _utc(values) -> pd.Series:
    return pd.to_datetime(values, utc=True).dt.as_unit("ns")


def to_frames(forecast_rows: list[dict], actual_rows: list[dict], refreshed_at: str) -> Dataset:
    fc = pd.DataFrame(forecast_rows)
    fc = pd.DataFrame(
        {
            "publish_time": _utc(fc["publishTime"]),
            "start_time": _utc(fc["startTime"]),
            "forecast_mw": fc["generation"].astype(float),
        }
    )
    fc = (
        fc.drop_duplicates(["publish_time", "start_time"], keep="last")
        .sort_values(["publish_time", "start_time"])
        .reset_index(drop=True)
    )

    hh = pd.DataFrame(actual_rows)
    hh = pd.DataFrame(
        {
            "start_time": _utc(hh["startTime"]),
            "actual_mw": hh["generation"].astype(float),
        }
    )
    hh = hh.drop_duplicates("start_time", keep="last").sort_values("start_time")
    hh = hh.reset_index(drop=True)

    # Day-ahead auction products are hourly, and WINDFOR targets are hourly, so we
    # compare at hourly resolution: the mean of the two half-hours in each hour.
    # Hours missing a half-hour are dropped rather than half-filled.
    hourly = (
        hh.assign(start_time=hh["start_time"].dt.floor("h"))
        .groupby("start_time")["actual_mw"]
        .agg(["mean", "count"])
    )
    hourly = hourly[hourly["count"] == 2]["mean"].rename("actual_mw").reset_index()

    return Dataset(forecasts=fc, actuals=hourly, refreshed_at=refreshed_at)


@lru_cache(maxsize=1)
def load() -> Dataset:
    if FORECAST_SNAPSHOT.exists() and ACTUAL_SNAPSHOT.exists():
        forecasts, refreshed_at = _read(FORECAST_SNAPSHOT)
        actuals, _ = _read(ACTUAL_SNAPSHOT)
    else:
        log.warning("No snapshot found, downloading from Elexon")
        forecasts, actuals = download()
        refreshed_at = datetime.now(UK_TZ).isoformat(timespec="seconds")
        try:
            write_snapshot(forecasts, actuals)
        except OSError:  # read-only filesystem (e.g. serverless): keep in memory
            log.warning("Could not persist snapshot", exc_info=True)
    return to_frames(forecasts, actuals, refreshed_at)
