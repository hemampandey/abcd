"""FastAPI application: HTTP layer only. Business logic lives in analysis.py."""

from __future__ import annotations

import logging
import os
from datetime import date
from pathlib import Path
from typing import Annotated

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import analysis as an
from . import service, store
from .config import (
    BAND_LOOKBACK_DAYS,
    BAND_QUANTILES,
    DECISION_PRESETS,
    DEFAULT_DECISION_TIME,
    ELEXON_BASE_URL,
)
from .schemas import AccuracyOut, DayOut, MetaOut

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))

app = FastAPI(
    title="WindSight API",
    description="Day-ahead wind forecast decision support and accuracy analytics (GB, Jan 2026).",
    version="1.0.0",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
)
app.add_middleware(GZipMiddleware, minimum_size=1024)
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "*").split(","),
    allow_methods=["GET"],
    allow_headers=["*"],
)

DecisionTime = Annotated[
    str,
    Query(
        pattern=r"^([01]\d|2[0-3]):[0-5]\d$",
        description="Decision time on D-1, UK local (HH:MM)",
    ),
]
OptionalDay = Annotated[date | None, Query(description="Delivery day (inclusive)")]


def _check_day(day: date) -> None:
    days = an.scope_delivery_days()
    if not days[0] <= day <= days[-1]:
        raise HTTPException(422, f"delivery_date must be between {days[0]} and {days[-1]}")


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/api/meta", response_model=MetaOut)
def meta() -> dict:
    return {
        "delivery_days": an.scope_delivery_days(),
        "decision_month": "2026-01",
        "decision_presets": [p.__dict__ for p in DECISION_PRESETS],
        "default_decision_time": DEFAULT_DECISION_TIME,
        "band_quantiles": BAND_QUANTILES,
        "band_lookback_days": BAND_LOOKBACK_DAYS,
        "data_refreshed_at": store.load().refreshed_at,
        "sources": {
            "actuals": f"{ELEXON_BASE_URL}/datasets/FUELHH/stream (fuelType=WIND)",
            "forecasts": f"{ELEXON_BASE_URL}/datasets/WINDFOR/stream",
        },
    }


@app.get("/api/day/{delivery_date}", response_model=DayOut)
def day(delivery_date: date, decision_time: DecisionTime = DEFAULT_DECISION_TIME) -> dict:
    _check_day(delivery_date)
    return service.day_view(delivery_date, an.parse_decision_time(decision_time))


@app.get("/api/accuracy", response_model=AccuracyOut)
def accuracy(
    decision_time: DecisionTime = DEFAULT_DECISION_TIME,
    date_from: OptionalDay = None,
    date_to: OptionalDay = None,
) -> dict:
    days = an.scope_delivery_days()
    date_from = date_from or days[0]
    date_to = date_to or days[-1]
    _check_day(date_from)
    _check_day(date_to)
    if date_from > date_to:
        raise HTTPException(422, "date_from must be on or before date_to")
    return service.accuracy_view(an.parse_decision_time(decision_time), date_from, date_to)


# In the Docker image the built React app is copied to ./static and served from
# here, so one container serves both UI and API.
STATIC_DIR = Path(os.getenv("STATIC_DIR", Path(__file__).resolve().parent.parent / "static"))
if STATIC_DIR.is_dir():
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str) -> FileResponse:
        if path.startswith("api/"):
            raise HTTPException(404, "Not found")
        file = STATIC_DIR / path
        if path and file.is_file() and STATIC_DIR in file.resolve().parents:
            return FileResponse(file)
        return FileResponse(STATIC_DIR / "index.html")
