import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api, type Accuracy, type Meta } from "../api";
import { Icon, Tip } from "../components/ui";
import { fmtDay, fmtGW, fmtGWh, fmtPct } from "../format";
import { useFetch } from "../useFetch";

type AppView = "day" | "accuracy" | "method";

export function LandingView({ meta, open }: { meta: Meta; open: (v: AppView) => void }) {
  const days = meta.delivery_days;
  const { data } = useFetch(
    (s) => api.accuracy(meta.default_decision_time, days[0], days[days.length - 1], s),
    [meta.default_decision_time],
  );

  return (
    <div className="landing">
      <section className="hero">
        <div className="hero-copy">
          <h1>Buy tomorrow's power knowing how much wind to trust.</h1>
          <p className="hero-lede">The forecast you had at gate closure, corrected for its bias, with the low-wind case to cover.</p>
          <div className="hero-cta">
            <button className="btn btn-primary" onClick={() => open("day")}>
              Open day-ahead view
              <Icon name="arrow" />
            </button>
            <button className="btn btn-quiet" onClick={() => open("accuracy")}>
              See forecast accuracy
            </button>
          </div>
        </div>
        <HeroPreview data={data} />
      </section>

      <Stats data={data} />

      <ol className="steps" aria-label="How it works">
        <li>
          <span className="step-num">1</span>
          <h3>Pick the forecast you had</h3>
          <p>Newest one published before the 09:20 or 09:50 gate closure.</p>
        </li>
        <li>
          <span className="step-num">2</span>
          <h3>Correct its bias</h3>
          <p>Scaled by its track record over the last 14 settled days.</p>
        </li>
        <li>
          <span className="step-num">3</span>
          <h3>Size your cover</h3>
          <p>The P10 low-wind case shows how much backup to plan.</p>
        </li>
      </ol>
    </div>
  );
}

function HeroPreview({ data }: { data: Accuracy | null }) {
  const rows = data?.daily.map((d) => ({ ...d, label: fmtDay(d.delivery_date, { weekday: undefined }) })) ?? [];
  return (
    <figure className="hero-preview card" aria-label="Daily wind energy in January 2026: Elexon forecast, calibrated forecast and actual">
      <figcaption>
        <span>Daily wind energy, January 2026</span>
        <span className="legend">
          <span className="legend-item">
            <span className="legend-swatch" style={{ background: "var(--elexon)" }} />
            Elexon
          </span>
          <span className="legend-item">
            <span className="legend-swatch" style={{ background: "var(--calibrated)" }} />
            Calibrated
          </span>
          <span className="legend-item">
            <span className="legend-swatch" style={{ background: "var(--actual)" }} />
            Actual
          </span>
        </span>
      </figcaption>
      {data ? (
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={rows} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
            <XAxis dataKey="label" hide />
            <YAxis hide domain={[0, "auto"]} />
            <Tooltip
              cursor={{ stroke: "var(--axis)" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const r = payload[0].payload as (typeof rows)[number];
                return (
                  <Tip
                    title={fmtDay(r.delivery_date, { weekday: "long" })}
                    rows={[
                      { label: "Elexon", value: fmtGWh(r.forecast_mwh), color: "var(--elexon)" },
                      { label: "Calibrated", value: fmtGWh(r.calibrated_mwh), color: "var(--calibrated)" },
                      { label: "Actual", value: fmtGWh(r.actual_mwh), color: "var(--actual)" },
                    ]}
                  />
                );
              }}
            />
            <Line dataKey="forecast_mwh" stroke="var(--elexon)" strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line dataKey="calibrated_mwh" stroke="var(--calibrated)" strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line dataKey="actual_mwh" stroke="var(--actual)" strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <div className="skeleton" style={{ height: 240 }} aria-busy="true" />
      )}
    </figure>
  );
}

function Stats({ data }: { data: Accuracy | null }) {
  const m = data?.metrics;
  const gain = m?.calibrated_mae_mw != null ? ((m.mae_mw - m.calibrated_mae_mw) / m.mae_mw) * 100 : null;
  const items = [
    { value: fmtGW(m ? Math.abs(m.bias_mw) : null, 2), label: "average over-forecast" },
    { value: gain != null ? fmtPct(gain) : "–", label: "lower error after calibration" },
    { value: fmtPct(m?.band_coverage_pct), label: "of hours inside the forecast range" },
  ];
  return (
    <section className="stats" aria-label="Pilot results">
      {items.map((it) => (
        <div className="stat" key={it.label}>
          <div className="stat-value">{it.value}</div>
          <div className="stat-label">{it.label}</div>
        </div>
      ))}
    </section>
  );
}
