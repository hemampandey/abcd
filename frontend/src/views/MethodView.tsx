import type { Meta } from "../api";
import { Card } from "../components/ui";
import { fmtDateTime } from "../format";

export function MethodView({ meta }: { meta: Meta }) {
  const [lo, hi] = meta.band_quantiles.map((q) => Math.round(q * 100));
  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">Reference</p>
          <h1>Method & definitions</h1>
          <p>How every number in WindSight is produced, so the desk can trust it and audit it.</p>
        </div>
      </div>
      <div className="grid-2">
        <Card title="Data">
          <div className="prose">
            <ul>
              <li>
                <b>Actuals:</b> Elexon BMRS <code>FUELHH</code>, fuel type <code>WIND</code>. Half-hourly metered
                output, averaged to hourly MW (both half-hours required).
              </li>
              <li>
                <b>Forecasts:</b> Elexon BMRS <code>WINDFOR</code>. Hourly targets up to ~3 days ahead, about 8 runs
                a day (02:30, 04:30, 07:30, 09:30, 11:30, 15:30, 18:30, 22:30 UTC).
              </li>
              <li>
                <b>Scope:</b> purchase decisions made in January 2026, so delivery days 2 Jan – 1 Feb 2026. Data
                from mid-December is used only to calibrate early-January decisions.
              </li>
              <li>Snapshot refreshed {meta.data_refreshed_at ? fmtDateTime(meta.data_refreshed_at) : "–"}.</li>
            </ul>
          </div>
        </Card>
        <Card title="Which forecast counts as 'latest'">
          <div className="prose">
            <p>
              For delivery day <b>D</b>, the decision is made on <b>D-1</b> at the chosen time (UK local). For each
              delivery hour we take the most recent forecast whose <code>publishTime</code> is at or before that
              moment. Nothing published later is used.
            </p>
            <p>
              Presets match the GB day-ahead auction gate closures:{" "}
              {meta.decision_presets.map((p) => `${p.label} ${p.time}`).join(", ")}. You can enter any other time
              to test your own internal deadline.
            </p>
          </div>
        </Card>
        <Card title="Accuracy metrics">
          <div className="prose">
            <ul>
              <li>
                <b>Error</b> = actual − forecast (MW). Negative means wind fell short and the buyer is short.
              </li>
              <li>
                <b>MAE</b>: mean absolute hourly error. <b>RMSE</b> penalises big misses. <b>Bias</b>: mean error.
              </li>
              <li>
                <b>nMAE</b>: MAE as a % of mean actual output. <b>P90 abs error</b>: 1 hour in 10 is worse.
              </li>
              <li>
                Daily energy is the sum of hourly MW across the day, in MWh. The day has 23 or 25 hours when the
                clocks change.
              </li>
            </ul>
          </div>
        </Card>
        <Card title={`Calibrated forecast & P${lo}–P${hi} range`}>
          <div className="prose">
            <p>
              Elexon over-forecasts more on windy hours than on calm ones, so the correction depends on the wind
              level. It is learned from the {meta.band_lookback_days} most recent <i>fully settled</i> delivery days
              (D-15 … D-2). D-1 is not yet complete at the D-1 decision.
            </p>
            <ul>
              <li>
                <b>Calibrated</b> = a straight line fitted to actual vs forecast over that window
                (intercept + slope × forecast), capped so it never goes above Elexon's forecast.
              </li>
              <li>
                <b>Range</b> = calibrated × P{lo}/P{hi} of hourly actual ÷ calibrated ratios in the window.
                Hours below 1 GW are excluded because their ratios are unstable.
              </li>
              <li>
                Reliability is checked out-of-sample: the share of hours that land inside the range should be
                close to {hi - lo}%.
              </li>
            </ul>
          </div>
        </Card>
      </div>
    </>
  );
}
