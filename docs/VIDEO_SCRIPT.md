# Demo video script (max 10 min, unlisted YouTube)

## Before you record

- [ ] Deploy first if you can, and record using the live URL (it looks more finished). Localhost is fine otherwise.
- [ ] Browser window about 1280×800, light theme (moon/sun icon, top right), zoom 100%.
- [ ] Open these tabs:
  1. `/?view=day&day=2026-01-15&t=09:20`
  2. `/?view=accuracy&t=09:20`
  3. `/?view=day&day=2026-01-12&t=09:20`
  4. the repo in VS Code, with a terminal ready to run `pytest -q`
- [ ] Do one dry run with a timer. Each part must stay under 5 minutes.
- [ ] Upload to YouTube as **Unlisted**, then open the link in an incognito window to check it plays.

---

## Part 1: client pitch (≤ 5 min)

**Audience:** day-ahead trading team lead. **Goal:** they leave convinced the pilot found something valuable.

| Time | Screen | Say |
|---|---|---|
| 0:00 | Day-ahead tab, 15 Jan | "Every morning before 09:20 your team commits to tomorrow's position. Wind is the biggest unknown. Today we'll show the latest forecast you actually had at gate closure, how far to trust it, and how much cover the low-wind case needs." |
| 0:30 | Header picker, then the line under the title | "Pick the delivery day and the auction: EPEX at 09:20 or N2EX at 09:50. The app finds the most recent Elexon wind forecast published before that moment. Here, the decision is Wednesday 09:20, so it uses the Wednesday 07:30 forecast. The 09:30 one came ten minutes too late, so it's never used." |
| 1:00 | KPI tiles | "Elexon says 279 GWh tomorrow. Our calibrated view says 241. On a low-wind day, the P10, it's 191 GWh, so that's 50 GWh of potential shortfall to size cover for. The grey tile is hindsight: actual was 254 GWh, and our calibrated number was 34% closer than the raw forecast." |
| 1:40 | Main chart, hover an hour | "Hour by hour: orange is Elexon, blue is calibrated, the shaded band is the 80% range, black is what happened. Hover any hour for the exact numbers. Export to CSV for your bid sheet." |
| 2:05 | Evolution chart | "This shows how the forecast evolved: every run for this day. The highlighted one is what you had at the gate; the dashed ones came too late." |
| 2:25 | Switch to Accuracy tab | "Now, how good is this forecast? We replayed every decision made in January. That means delivery from 2 January to 1 February, 744 delivery hours." |
| 2:40 | KPI strip, left to right | "Three headlines. **One:** the official forecast ran high all month, by 1.75 GW on average, and wind fell short in 85% of hours. Trusting it raw leaves you short and exposed to imbalance. **Two:** our calibration, using only data you'd have had that morning, cuts the typical error by 35%, from 2.04 to 1.32 GW. **Three:** the range is honest. We promised 80% and 82% of hours landed inside." |
| 3:25 | Daily chart, then histogram | "Day by day you can see the gap. The histogram shows misses lean heavily to shortfall, with a tail out to 6–7 GW." |
| 3:50 | Horizon and decision-time charts | "Accuracy decays with horizon. Deciding later helps, but both auctions close in the morning. N2EX at 09:50 gets the 09:30 run and is slightly better than EPEX 09:20, which is useful when choosing a venue." |
| 4:15 | Point at "Worst: 6.9 GW short on Mon 12 Jan", then open the 12 Jan tab, evolution chart | "The worst hour was on 12 January. Even the forecasts published after the gate were about 5 GW too high. That's consistent with wind farms being curtailed on a windy day, rather than bad weather prediction, and it's the pattern our calibration learns." |
| 4:35 | Close | "Next steps for a production phase: daily automatic ingest, adding your demand to show net position, and alerts when the range is unusually wide. Thank you." |

---

## Part 2: tech lead review (≤ 5 min)

**Audience:** internal tech lead. **Goal:** easy review and clear handover.

| Time | Screen | Say |
|---|---|---|
| 0:00 | README in VS Code | "Repo layout: `backend/` is FastAPI and pandas, `frontend/` is React 19 with TypeScript and Recharts, plus Docker, Vercel config and CI. The README covers run, test and deploy. Architecture and analysis docs are in `docs/`." |
| 0:30 | `docs/ARCHITECTURE.md` diagram | "Data flow: the Elexon client fetches FUELHH and WINDFOR into a gzipped snapshot in git. Why a snapshot: January is history, so it's reproducible, cold starts are instant on serverless, and there's no dependency on Elexon uptime. `python -m app.ingest` refreshes it, and it falls back to a live download if missing." |
| 1:00 | `config.py` | "All business assumptions live in one file. Scope: January decisions means delivery 2 Jan – 1 Feb, because you decide one day ahead. Data from mid-December is loaded only as history for the early-January calibration, the same history a trader would have on 1 January; nothing in December is scored. Also here: gate-closure presets and band settings." |
| 1:20 | `analysis.py`: `decision_cutoff`, `latest_forecasts` | "The core rule: the cutoff is D-1 at the chosen UK local time, converted with zoneinfo, so DST works. `merge_asof` by start_time with direction backward picks the latest forecast with publish_time at or before the cutoff. Look-ahead is structurally impossible." |
| 1:55 | `add_calibration` | "Calibration is multiplicative because errors scale with wind level. The window is D-15 to D-2, because D-1 isn't settled at 09:20 on D-1. There's a unit test that corrupts D-1 and D and asserts nothing changes." |
| 2:25 | `service.py`, `main.py`, `schemas.py` | "Layers: routes validate at the edge, with HH:MM regex and date range, and return 422 otherwise. The service caches backtests per decision time. Pydantic models give typed OpenAPI docs at `/api/docs`. The frontend's `api.ts` mirrors them." |
| 2:55 | `frontend/src` | "Frontend: App holds state in the URL so views are shareable. DayView and AccuracyView are each one screen. `ui.tsx` has shared chart chrome. Colour by role, one axis per chart, hindsight explicitly labelled." |
| 3:25 | Terminal: `pytest -q`, `npm test` | "28 backend tests: DST days, no-look-ahead, exact-cutoff inclusion, calibration leakage, metric arithmetic, and API tests on real data, for example that 09:20 picks the 07:30 run and 09:50 picks the 09:30 run. CI runs ruff, pytest, tsc, vitest, a Vite build and a Docker smoke test." |
| 4:00 | Dockerfile, vercel.json | "Multi-stage Docker builds React, then serves it with uvicorn, giving one container, also used for Heroku. Vercel serves the static build and a Python function at `api/index.py`." |
| 4:25 | ARCHITECTURE trade-offs table | "Known trade-offs: pandas in the request path is fine at 30k rows; at scale, precompute. Ratio calibration was chosen for explainability; next would be conditional or quantile models. AI-assisted development is disclosed in the README; every number was verified by running the code. Thanks." |
