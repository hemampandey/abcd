"""API response models (also drive the OpenAPI docs at /api/docs)."""

from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel


class DecisionPresetOut(BaseModel):
    id: str
    label: str
    time: str
    description: str


class MetaOut(BaseModel):
    delivery_days: list[date]
    decision_month: str
    decision_presets: list[DecisionPresetOut]
    default_decision_time: str
    band_quantiles: tuple[float, float]
    band_lookback_days: int
    data_refreshed_at: str
    sources: dict[str, str]


class HourOut(BaseModel):
    start_time: datetime
    local_time: str
    forecast_mw: float | None
    calibrated_mw: float | None
    band_low_mw: float | None
    band_high_mw: float | None
    actual_mw: float | None
    error_mw: float | None
    lead_hours: float | None


class RunPoint(BaseModel):
    start_time: datetime
    forecast_mw: float


class RunOut(BaseModel):
    publish_time: datetime
    status: str  # used | earlier | after_cutoff
    points: list[RunPoint]


class CalibrationOut(BaseModel):
    slope: float | None
    intercept_mw: float | None
    ratio_low: float | None
    ratio_high: float | None
    hours: int
    window_from: date
    window_to: date


class DaySummaryOut(BaseModel):
    forecast_mwh: float
    calibrated_mwh: float | None
    low_case_mwh: float | None
    high_case_mwh: float | None
    actual_mwh: float | None
    peak_forecast_mw: float
    min_forecast_mw: float
    mae_mw: float | None
    calibrated_mae_mw: float | None
    max_shortfall_mw: float | None


class DayOut(BaseModel):
    delivery_date: date
    decision_time: str
    decision_cutoff: datetime
    forecast_publish_time: datetime | None
    calibration: CalibrationOut
    summary: DaySummaryOut
    hours: list[HourOut]
    runs: list[RunOut]


class AccuracyOut(BaseModel):
    decision_time: str
    date_from: date
    date_to: date
    metrics: dict[str, float | int | None]
    daily: list[dict]
    by_hour: list[dict]
    histogram: list[dict]
    lead_time: list[dict]
    decision_time_sensitivity: list[dict]
