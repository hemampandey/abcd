"""Rebuild the bundled data snapshot from the Elexon API.

Usage (from backend/):  python -m app.ingest
"""

from __future__ import annotations

import logging

from .store import download, write_snapshot


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    forecasts, actuals = download()
    write_snapshot(forecasts, actuals)


if __name__ == "__main__":
    main()
