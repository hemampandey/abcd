"""Thin client for the two Elexon BMRS datasets we use.

- FUELHH: half-hourly outturn generation by fuel type (we keep fuelType=WIND)
- WINDFOR: wind generation forecasts, hourly targets, ~8 runs per day

Requests are split into chunks so a long date range never hits API limits, and
transient failures are retried.
"""

from __future__ import annotations

import logging
import time
from datetime import UTC, date, datetime, timedelta

import httpx

from .config import ELEXON_BASE_URL

log = logging.getLogger(__name__)

CHUNK_DAYS = 14
RETRIES = 3


def _get(client: httpx.Client, path: str, params: dict) -> list[dict]:
    for attempt in range(1, RETRIES + 1):
        try:
            resp = client.get(f"{ELEXON_BASE_URL}{path}", params=params)
            resp.raise_for_status()
            return resp.json()
        except (httpx.HTTPError, ValueError) as exc:
            if attempt == RETRIES:
                raise
            log.warning("Elexon %s failed (%s), retry %d", path, exc, attempt)
            time.sleep(2**attempt)
    return []  # unreachable


def _iso(dt: datetime) -> str:
    return dt.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def fetch_wind_forecasts(publish_from: datetime, publish_to: datetime) -> list[dict]:
    """WINDFOR rows with publishTime in [publish_from, publish_to)."""
    rows: list[dict] = []
    with httpx.Client(timeout=60) as client:
        start = publish_from
        while start < publish_to:
            end = min(start + timedelta(days=CHUNK_DAYS), publish_to)
            chunk = _get(
                client,
                "/datasets/WINDFOR/stream",
                {"publishDateTimeFrom": _iso(start), "publishDateTimeTo": _iso(end)},
            )
            # The API bounds are inclusive; keep the half-open interval explicit.
            rows.extend(r for r in chunk if r["publishTime"] < _iso(end) or end == publish_to)
            start = end
    return [
        {
            "publishTime": r["publishTime"],
            "startTime": r["startTime"],
            "generation": r["generation"],
        }
        for r in rows
    ]


def fetch_wind_actuals(date_from: date, date_to: date) -> list[dict]:
    """FUELHH WIND rows for settlement dates in [date_from, date_to]."""
    rows: list[dict] = []
    with httpx.Client(timeout=60) as client:
        start = date_from
        while start <= date_to:
            end = min(start + timedelta(days=CHUNK_DAYS - 1), date_to)
            rows.extend(
                _get(
                    client,
                    "/datasets/FUELHH/stream",
                    {
                        "settlementDateFrom": start.isoformat(),
                        "settlementDateTo": end.isoformat(),
                        "fuelType": "WIND",
                    },
                )
            )
            start = end + timedelta(days=1)
    return [
        {"startTime": r["startTime"], "generation": r["generation"]}
        for r in rows
        if r.get("fuelType") == "WIND"
    ]
