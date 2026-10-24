"""Domain constants and settings.

Everything that encodes a business assumption lives here so it can be reviewed
in one place.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from zoneinfo import ZoneInfo

UK_TZ = ZoneInfo("Europe/London")

ELEXON_BASE_URL = os.getenv("ELEXON_BASE_URL", "https://data.elexon.co.uk/bmrs/api/v1")

# Scope: purchase decisions made in January 2026. A day-ahead decision taken on
# day D-1 buys power for delivery day D, so the delivery days in scope run from
# 2 January to 1 February 2026.
DECISION_MONTH_FIRST = date(2026, 1, 1)
DECISION_MONTH_LAST = date(2026, 1, 31)

# Extra history before the scope, used only to warm up the out-of-sample error
# bands for early-January deliveries (what a trader would have had on 1 Jan).
WARMUP_START = date(2025, 12, 15)

# Trailing window (in delivery days) used to calibrate the uncertainty band.
BAND_LOOKBACK_DAYS = 14
BAND_QUANTILES = (0.10, 0.90)


@dataclass(frozen=True)
class DecisionPreset:
    id: str
    label: str
    time: str  # HH:MM, UK local time on D-1
    description: str


# GB day-ahead auction gate closures (UK local time) since January 2021.
DECISION_PRESETS: tuple[DecisionPreset, ...] = (
    DecisionPreset(
        "epex",
        "EPEX SPOT GB day-ahead",
        "09:20",
        "Hourly GB day-ahead auction, gate closure 09:20 UK time on D-1",
    ),
    DecisionPreset(
        "n2ex",
        "Nord Pool N2EX day-ahead",
        "09:50",
        "N2EX GB day-ahead auction, gate closure 09:50 UK time on D-1",
    ),
)
DEFAULT_DECISION_TIME = DECISION_PRESETS[0].time

DATA_DIR = Path(os.getenv("DATA_DIR", Path(__file__).resolve().parent.parent / "data"))
FORECAST_SNAPSHOT = DATA_DIR / "windfor.json.gz"
ACTUAL_SNAPSHOT = DATA_DIR / "fuelhh_wind.json.gz"
