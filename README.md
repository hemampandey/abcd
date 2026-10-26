# WindSight: GB day-ahead wind desk

WindSight is a web app for a UK utility's day-ahead power buying team. It answers two questions:

1. **What did the latest wind forecast say when we had to decide?** For each delivery day it shows the newest Elexon wind forecast published before the day-ahead auction gate closure on D-1, a calibrated version of that forecast, and a P10–P90 range.
2. **How much can we trust it?** It backtests every January 2026 decision against metered wind output. It reports MAE, bias, tail errors and reliability, plus how error changes with forecast horizon and with when you decide.

> [Live app](https://abcd-hemam.vercel.app/)

> **Video walkthrough:** [YT link](https://youtu.be/cd0MNaVhAFc)

![Stack](https://img.shields.io/badge/React_19-TypeScript-blue) ![Stack](https://img.shields.io/badge/FastAPI-pandas-green) ![Docker](https://img.shields.io/badge/Docker-ready-informational)

---

## Headline findings (January 2026 decisions, EPEX 09:20 gate)

| | Elexon forecast at gate | Calibrated (WindSight) |
|---|---|---|
| Typical hourly error (MAE) | **2.04 GW** (18% of mean output) | **1.22 GW** (−40%) |
| Bias (actual − forecast) | **−1.75 GW**: wind fell short in 85% of hours | −0.12 GW |
| 1-in-10 hour error (P90 abs) | 4.1 GW | — |
| P10–P90 range reliability | — | **79%** of hours inside (target 80%) |

- The official forecast **over-predicted** GB metered wind throughout January. The gap grows with wind speed: about −0.5 GW when the forecast was under 5 GW, and about −4.6 GW when it was over 20 GW. That pattern fits transmission constraints and curtailment on windy days.
- A wind-level-aware correction, learned only from days already settled at decision time, removes nearly all of the bias and cuts MAE by 40%. It beats the raw forecast on 26 of 31 days.
- Error grows with horizon: 1.7 GW MAE at 0–6 h ahead and 2.3 GW at 42–48 h ahead. The N2EX gate (09:50) can use the 09:30 run and is slightly more accurate than EPEX (09:20): 2.01 vs 2.04 GW.

Details: [docs/ANALYSIS.md](docs/ANALYSIS.md).

---

## Quick start

### Option A: Docker (one container, UI and API)

```bash
docker compose up --build
```

Open http://localhost:8000. API docs are at http://localhost:8000/api/docs.

### Option B: local dev (hot reload)

```bash
# backend (Python 3.11+)
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn app.main:app --reload --port 8000

# frontend (Node 20.19+), in a second terminal
cd frontend
npm ci
npm run dev        # http://localhost:5173, proxies /api to :8000
```

### Tests and lint

```bash
cd backend && pytest -q && ruff check app tests     # 30 tests
cd frontend && npm test && npm run lint              # unit tests + type-check
```

### Refresh the data snapshot (optional)

The app ships a gzipped snapshot of the raw Elexon rows, so it starts instantly and works offline. To rebuild it from the live API:

```bash
cd backend && python -m app.ingest
```

If the snapshot files are missing, the backend downloads the data from Elexon automatically on first request.

---

## Repository layout

```
.
├── backend/                     Python API (FastAPI + pandas)
│   ├── app/
│   │   ├── config.py            Business assumptions in one place: scope, gate closures, band settings
│   │   ├── elexon.py            Elexon BMRS client (FUELHH, WINDFOR) with chunking and retries
│   │   ├── store.py             Snapshot load/save → tidy DataFrames (hourly actuals)
│   │   ├── analysis.py          Pure functions: forecast selection, backtest, calibration, metrics
│   │   ├── service.py           Caching and shaping of analysis results for the API
│   │   ├── schemas.py           Pydantic response models (drive the OpenAPI docs)
│   │   ├── main.py              HTTP routes, validation, static file serving
│   │   └── ingest.py            CLI: rebuild the data snapshot
│   ├── data/                    windfor.json.gz, fuelhh_wind.json.gz (raw Elexon rows)
│   ├── tests/                   test_analysis.py (unit), test_api.py (API on real snapshot)
│   ├── requirements*.txt, pyproject.toml (ruff and pytest config)
├── frontend/                    React 19 + TypeScript + Vite + Recharts
│   ├── src/
│   │   ├── App.tsx              Shell, tabs, decision-time picker, URL state
│   │   ├── api.ts               Typed API client (mirrors schemas.py)
│   │   ├── format.ts            Units, dates (Europe/London), ticks, CSV export
│   │   ├── useFetch.ts          Fetch hook with abort-on-change
│   │   ├── components/ui.tsx    Card, KPI tile, legend, tooltip, shared chart chrome
│   │   ├── views/LandingView.tsx  Landing page: pitch, live headline results, links into the app
│   │   ├── views/DayView.tsx    Day-ahead view: KPIs, forecast vs range, forecast evolution, table
│   │   ├── views/AccuracyView.tsx  Accuracy view: KPI strip, 5 diagnostic charts
│   │   ├── views/MethodView.tsx    Definitions shown to users
│   │   └── styles.css           Design tokens (light and dark)
├── api/index.py                 Vercel serverless entrypoint (wraps backend/app)
├── vercel.json                  Vercel build: static frontend + Python function
├── Dockerfile                   Multi-stage: build React → serve with uvicorn
├── docker-compose.yml           Local one-command run
├── heroku.yml                   Heroku container deploy
├── requirements.txt             Python deps for Vercel (CI checks they match backend pins)
├── .github/workflows/ci.yml     Lint, test, build, Docker smoke test
└── docs/
    ├── ARCHITECTURE.md          Design, data flow, key decisions, trade-offs
    ├── ANALYSIS.md              Findings and how to read them
    └── VIDEO_SCRIPT.md          Script for the two-part demo video
```

---

## How it works (short version)

- **Scope.** Decisions made in January 2026 → delivery days **2 Jan – 1 Feb 2026** (D-1 decides for D).
- **Latest forecast.** For every delivery hour, the most recent `WINDFOR` value with `publishTime ≤ decision time on D-1` (UK local). Presets: **EPEX 09:20** and **N2EX 09:50** (GB day-ahead auction gate closures). Any custom time also works.
- **Actuals.** `FUELHH` with `fuelType=WIND`, half-hourly, averaged to hourly to match the hourly forecast and hourly auction products.
- **Calibration and range.** Learned only from delivery days D-15 to D-2, the days fully settled before the D-1 decision. Calibrated = min(intercept + slope × forecast, forecast): a straight line fitted to recent actual vs forecast, never above Elexon. Range = calibrated × P10/P90 of hourly actual/calibrated ratios.
- **Error sign.** `error = actual − forecast`. Negative means wind fell short and the buyer is short.

Full rationale: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## API

| Endpoint | Purpose |
|---|---|
| `GET /api/meta` | Delivery days in scope, gate presets, band settings, data refresh time |
| `GET /api/day/{YYYY-MM-DD}?decision_time=HH:MM` | Day view: forecast used, calibration, range, actuals, every forecast run |
| `GET /api/accuracy?decision_time=HH:MM&date_from=&date_to=` | Metrics, daily/hourly breakdowns, histogram, lead-time and decision-time curves |
| `GET /api/health` | Liveness |

Interactive docs: `/api/docs`.

## Deploy

**Vercel** (free tier): import the GitHub repo in Vercel. The settings come from `vercel.json`: the React build is served statically and `/api/*` is routed to the Python function `api/index.py`. No environment variables are needed. CLI alternative:

```bash
npm i -g vercel && vercel --prod
```

**Heroku** (container stack):

```bash
heroku create <app> --stack container && git push heroku main
```

## Use of AI tools

This project was built with help from an AI coding assistant (**Claude Code**, Anthropic). It helped with exploring the Elexon API, scaffolding, writing code and tests, and drafting documentation. All design choices, the analysis method and the numbers above were checked by running the code against the real data. The test suite encodes the key domain rules: no look-ahead, D-2 calibration window, and gate-closure forecast selection.

## Data licence

Contains BSC Information licensed under the [BSC Open Data Licence](https://www.elexon.co.uk/bsc/data/balancing-mechanism-reporting-agent/copyright-licence-bmrs-data/).
