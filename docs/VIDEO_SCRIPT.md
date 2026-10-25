# WindSight: full video script

Two parts, each **under 5 minutes** (about 650 spoken words each at a calm pace).
Lines in **[brackets]** are what to do on screen. Everything else is what you say.

---

## Before you record

- [ ] Use the live Vercel link if it's deployed; localhost is fine otherwise.
- [ ] Browser about 1280×800, **light theme** (moon/sun icon, top right), zoom 100%.
- [ ] Open these tabs in order:
  1. Landing page: `/`
  2. Day-ahead, 15 Jan: `/?view=day&day=2026-01-15&t=09:20`
  3. Forecast accuracy: `/?view=accuracy&t=09:20`
  4. Day-ahead, 14 Jan: `/?view=day&day=2026-01-14&t=09:20`
  5. VS Code with the repo open, and a terminal in `backend/`
- [ ] Do one timed dry run. Speak slowly; pauses are fine.
- [ ] Upload to YouTube as **Unlisted** and check the link in an incognito window.

---

## Part 1: client presentation (≈ 4:45)

*Audience: the day-ahead trading team at the utility. Goal: show them what the pilot found and why it's useful.*

### 1. Opening: the problem (0:00 – 0:35)

**[Landing page, scrolled to the top]**

> Hi, I'm Hemam, and this is WindSight, a pilot we built for your day-ahead trading desk.
>
> Every morning your team has to buy tomorrow's electricity before the auction closes: 09:20 for EPEX, 09:50 for N2EX. The biggest unknown in that decision is wind. If wind comes in lower than forecast, you're short and buying expensive power at the last minute. If it comes in higher, you've overpaid.
>
> So we asked two questions. What did the wind forecast actually say when you had to decide? And how much should you trust it?

### 2. The headline results (0:35 – 1:20)

**[Point at the chart, then the three numbers]**

> This chart is January in one picture. Orange is Elexon's official wind forecast, black is what actually happened. The orange line sits above the black almost every day.
>
> That's our first finding: **the official forecast ran 1.75 gigawatts too high on average.** Wind fell short of the forecast in 85% of hours. A desk that trusted it would have been short almost every day.
>
> Second: we built a correction that learns from the forecast's own recent track record, and it's smart about wind level: windy hours get a bigger correction than calm ones. It **cuts the typical error by 40%.**
>
> Third: we give you a realistic range, a low and a high case. We promised reality would land inside it 80% of the time. It did **79%** of the time, so you can rely on it.

### 3. The day-ahead view (1:20 – 2:50)

**[Click "Open day-ahead view". Tab 2, Thursday 15 January]**

> Let me show you how your team would use it. Say it's Wednesday morning, and we're buying for Thursday the 15th.

**[Point at the line under the title]**

> The app knows the decision is Wednesday at 09:20, and it picks the newest forecast published before then: the 07:30 run. A newer forecast came out at 09:30, but that's ten minutes too late, so we never use it. Everything you see is what you could actually have known.

**[Point at each tile, left to right]**

> Elexon says 279 gigawatt-hours of wind tomorrow. Our corrected estimate is 250. And the low-wind case, a pessimistic but realistic scenario, is 202. That 48 gigawatt-hour gap is the cover you'd want to arrange in case the wind disappoints.
>
> The grey tile is hindsight: the actual was 254. Our 250 was within 2%; Elexon was 10% too high.

**[Hover over a few hours on the main chart]**

> Hour by hour: orange is Elexon, blue is our corrected forecast, the shaded band is the realistic range, and black is what happened. Your auctions trade by the hour, so this shows exactly which hours carry the risk. You can hover for exact numbers, or download the table as a CSV for your bidding sheet.

**[Scroll to "How the forecast evolved"]**

> This chart shows every forecast Elexon published for this day. The highlighted one is what you had at the deadline; if the lines are spread out, that's a day to be careful.

### 4. Forecast accuracy (2:50 – 4:00)

**[Tab 3, Forecast accuracy]**

> Now the trust question. We replayed every decision made in January, which means deliveries from 2 January to 1 February: 744 hours, each scored against what actually happened.

**[Point along the tiles]**

> The typical hourly miss was 2 gigawatts, about 18% of normal output. One hour in ten was off by more than 4. The worst hour was 12 January, when wind fell 6.9 gigawatts short.

**[Scroll to the histogram]**

> This chart shows the misses: red is wind falling short, blue is extra wind. It's overwhelmingly red. The errors aren't random; they lean one way. That's what makes them correctable.

**[Scroll to "Does deciding later help?"]**

> And timing: N2EX closes at 09:50, after Elexon's 09:30 update, so it gets a slightly more accurate forecast than EPEX at 09:20.

### 5. Being honest about the limits (4:00 – 4:25)

**[Tab 4, Wednesday 14 January]**

> One honest point. The correction doesn't win every day. On the 14th, Elexon was almost exactly right, and our correction pulled the number too low. Across January it helped on 26 of 31 days, which is why we always show Elexon's number alongside ours, never instead of it.

### 6. Close (4:25 – 4:45)

**[Back to the landing page]**

> So, WindSight gives your desk three things: the forecast you actually had at the deadline, a corrected estimate that's 40% more accurate on average, and a low-wind case you can size your cover against.
>
> For a production version, we'd add daily automatic data updates, your demand forecast to show your net position, and an alert when the range is unusually wide. Thank you.

---

## Part 2: technical review (≈ 4:50)

*Audience: the internal tech lead. Goal: make the code easy to review and hand over.*

### 1. Overview (0:00 – 0:30)

**[VS Code, README open]**

> This is the technical walkthrough. The repo has two halves. `backend/` is Python, with FastAPI for the API and pandas for the analysis. `frontend/` is React with TypeScript, using Recharts for the charts. There's also a Dockerfile, the Vercel config, and a CI pipeline. The README covers how to run, test and deploy, and `docs/` has the architecture and analysis notes.

### 2. Data (0:30 – 1:10)

**[Open `backend/app/elexon.py`, then `backend/data/`]**

> The data comes from two Elexon datasets. FUELHH gives actual wind output every half hour, and WINDFOR gives the wind forecasts: hourly targets, about eight runs a day.
>
> `elexon.py` downloads both in two-week chunks with retries. Rather than calling Elexon on every request, we store a compressed snapshot in the repo, about 165 kilobytes. January is history, so this keeps results reproducible and makes cold starts instant on serverless. `python -m app.ingest` rebuilds it.

### 3. Business rules in one place (1:10 – 1:35)

**[Open `backend/app/config.py`]**

> All the business assumptions live in this one file. The brief says decisions made in January. You decide on D-1, the day before delivery, so delivery runs from 2 January to 1 February. Data from mid-December is loaded only as history for the early-January correction; it's never scored. The two gate-closure presets and the band settings are here too.

### 4. The core logic (1:35 – 2:45)

**[Open `backend/app/analysis.py`, scroll to `decision_cutoff` and `latest_forecasts`]**

> `analysis.py` holds all the maths as pure functions, which makes it easy to test.
>
> The key rule is here. `decision_cutoff` turns "D-1 at 09:20 UK time" into a UTC timestamp using zoneinfo, so clock changes are handled. Then `latest_forecasts` uses pandas `merge_asof`, grouped by target hour and looking backwards in time. For each hour it finds the newest forecast published at or before the cutoff. That makes look-ahead structurally impossible.

**[Scroll to `add_calibration`]**

> The correction is in `add_calibration`. For each delivery day it uses only days D-15 to D-2, because at 09:20 on D-1, that day hasn't finished yet. It fits a straight line of actual against forecast on that window, so windy hours get a bigger correction than calm ones, and caps it so it never goes above Elexon's forecast, because the systematic error is over-forecasting. The range comes from the 10th and 90th percentiles of actual over corrected, in the same window.
>
> I compared this out of sample against a single scale factor and an uncapped line. The capped line had the lowest error, lost on no more days, and gave a range 18% narrower at the same reliability.

### 5. API and frontend (2:45 – 3:30)

**[Open `main.py`, then `service.py`, then `frontend/src/views/`]**

> The layers are kept separate. `main.py` is just the HTTP routes. It validates the decision time and date range and returns a 422 with a clear message if they're wrong. `service.py` shapes the results and caches each backtest per decision time. Pydantic models generate typed API docs at `/api/docs`.
>
> On the frontend there's one file per screen: the landing page, day-ahead, accuracy and method. Shared pieces like tiles, legends and tooltips are in `ui.tsx`. The app keeps its state in the URL, so any view can be bookmarked or shared.

### 6. Tests and CI (3:30 – 4:15)

**[Terminal in `backend/`: run `pytest -q`]**

> There are 30 backend tests. The unit tests use small synthetic data to check the domain rules: clock-change days with 23 and 25 hours, never using a forecast published after the cutoff, and the error sign. The most important one corrupts D-1 and D and checks the correction doesn't change, which proves there's no leakage. The API tests run on the real data, for example checking that 09:20 picks the 07:30 run and 09:50 picks the 09:30 run.
>
> The frontend has unit tests for formatting. CI runs linting, both test suites, a type check, a production build, and a Docker smoke test.

### 7. Deployment and trade-offs (4:15 – 4:50)

**[Open `Dockerfile`, then `vercel.json`, then the trade-offs table in `docs/ARCHITECTURE.md`]**

> The Dockerfile is multi-stage: it builds the React app, then serves it and the API from one container. On Vercel, the React build is served statically and the API runs as a Python function in `api/index.py`.
>
> Known trade-offs: pandas in the request path is fine at 30,000 rows; at larger scale I'd precompute the backtests. And with more history, the next step for the correction would be curtailment signals and quantile regression for the range. Thanks for reviewing.

---

## Q&A prep: questions a reviewer might ask

**Why does delivery run 2 Jan – 1 Feb and not 1–31 Jan?**
The brief scopes *decisions* to January. You decide on D-1 for delivery on D, so the decision on 1 January is for delivery on 2 January, and the decision on 31 January is for delivery on 1 February.

**Why use December data if the brief says only January?**
Only as history for the correction, which needs the previous 14 settled days. That's exactly what a trader would have had on 1 January. Nothing in December is shown or scored.

**Why compare hourly, when actuals are half-hourly?**
WINDFOR forecasts are hourly and the day-ahead auctions trade hourly products. So the two half-hours are averaged, and hours missing a half-hour are dropped rather than half-filled.

**Why not train a machine-learning model?**
The brief allows only these two datasets, so there are no weather features, and one month is about 744 hours. A complex model would mostly overfit. The correction is already a small model, a straight line refitted every day on the last 14 settled days. I compared it against a scale factor, an uncapped line, a curve and per-wind-level factors, all out of sample, and picked the one with the lowest error that didn't lose more days.

**Why does the correction sometimes make things worse (e.g. 14 Jan)?**
It learns the recent pattern of over-forecasting and applies it every day. On calm days when Elexon happened to be right, it overshoots. It helped on 26 of 31 days and cut error by 40% overall, which is why the app always shows Elexon's number next to ours. The level-aware version also roughly halved the damage on 14 January compared with a simple scale factor.

**Why a straight line, and why cap it at Elexon's forecast?**
Elexon's miss grows with wind level, so a line (bigger cut on windy hours) fits better than one multiplier. Elexon over-forecast at every wind level in this data, so the correction should only remove over-forecast, never add wind Elexon didn't predict. Without the cap, calm hours get pushed above Elexon and two more days are lost.

**Why is the forecast so consistently too high?**
The miss grows with wind level: about −0.5 GW when the forecast is under 5 GW, about −4.6 GW above 20 GW. That's consistent with wind farms being curtailed on windy days because of grid constraints. Metered output is after curtailment; the forecast isn't. It's a hypothesis, not proven from this data alone.

**How do you know there's no look-ahead?**
Forecast selection uses `merge_asof` looking backwards from the cutoff, and the correction window ends at D-2. Both rules have dedicated tests, including one that corrupts D-1 and D and checks the result doesn't change.

**What would you do next?**
Automatic daily ingest into a database, the utility's demand to show net position, a wind-level-aware correction validated walk-forward, alerts when the range is wide, and authentication.
