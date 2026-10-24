import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, type Accuracy, type Meta } from "../api";
import { Card, ErrorState, Icon, Kpi, Legend, Loading, Tip, axisProps, gridProps, xAxisProps } from "../components/ui";
import { downloadCsv, fmtDay, fmtGW, fmtGWh, fmtMW, fmtPct, fmtSigned, niceTicks, tickGW, tickK } from "../format";
import { useFetch } from "../useFetch";

export function AccuracyView({
  meta,
  decisionTime,
  range,
  setRange,
}: {
  meta: Meta;
  decisionTime: string;
  range: [string, string];
  setRange: (r: [string, string]) => void;
}) {
  const [from, to] = range;
  const { data, error, loading } = useFetch((s) => api.accuracy(decisionTime, from, to, s), [decisionTime, from, to]);
  const days = meta.delivery_days;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>How accurate is the wind forecast?</h1>
        </div>
        <div className="toolbar">
          <label className="control">
            From
            <select value={from} onChange={(e) => setRange([e.target.value, e.target.value > to ? e.target.value : to])}>
              {days.map((d) => (
                <option key={d} value={d}>
                  {fmtDay(d)}
                </option>
              ))}
            </select>
          </label>
          <label className="control">
            to
            <select value={to} onChange={(e) => setRange([e.target.value < from ? e.target.value : from, e.target.value])}>
              {days.map((d) => (
                <option key={d} value={d}>
                  {fmtDay(d)}
                </option>
              ))}
            </select>
          </label>
          {(from !== days[0] || to !== days[days.length - 1]) && (
            <button className="btn" onClick={() => setRange([days[0], days[days.length - 1]])}>
              Whole month
            </button>
          )}
        </div>
      </div>

      {error && <ErrorState error={error} />}
      {loading && !data && <Loading height={640} />}
      {data && <AccuracyBody data={data} meta={meta} stale={loading} />}
    </>
  );
}

function AccuracyBody({ data, meta, stale }: { data: Accuracy; meta: Meta; stale: boolean }) {
  const m = data.metrics;
  const gain = m.calibrated_mae_mw != null ? ((m.mae_mw - m.calibrated_mae_mw) / m.mae_mw) * 100 : null;
  const [lo, hi] = meta.band_quantiles.map((q) => Math.round(q * 100));
  const shortHours = data.histogram.filter((b) => b.bin_end_mw <= 0).reduce((a, b) => a + b.count, 0);
  const worstDay = data.daily.reduce((a, b) => (b.max_shortfall_mw > a.max_shortfall_mw ? b : a), data.daily[0]);

  return (
    <div className="stack" aria-busy={stale}>

      <div className="kpis">
        <Kpi
          label="Typical error (MAE)"
          color="var(--elexon)"
          value={fmtGW(m.mae_mw, 2)}
          sub={<>{fmtPct(m.nmae_pct)} of average output</>}
        />
        <Kpi
          label="Bias"
          color="var(--elexon)"
          value={fmtSigned(m.bias_mw, "GW", 2)}
          sub={<>Wind fell short in {fmtPct((shortHours / m.n) * 100)} of hours</>}
        />
        <Kpi
          label="1-in-10 hour error"
          color="var(--elexon)"
          value={fmtGW(m.p90_abs_error_mw, 1)}
          sub={worstDay && <>Worst: {fmtGW(worstDay.max_shortfall_mw)} short on {fmtDay(worstDay.delivery_date)}</>}
        />
        {m.calibrated_mae_mw != null && (
          <Kpi
            label="Calibrated MAE"
            color="var(--calibrated)"
            value={fmtGW(m.calibrated_mae_mw, 2)}
            sub={
              gain != null && (
                <>
                  <span className="good">{fmtPct(gain)} lower</span> than Elexon
                </>
              )
            }
          />
        )}
        {m.band_coverage_pct != null && (
          <Kpi
            label={`P${lo}–P${hi} range hit rate`}
            color="var(--calibrated)"
            value={fmtPct(m.band_coverage_pct)}
            sub={<>Target {hi - lo}%</>}
          />
        )}
      </div>

      <DailyChart data={data} />
      <div className="grid-2">
        <HistogramChart data={data} />
        <HourChart data={data} />
      </div>
      <div className="grid-2">
        <LeadTimeChart data={data} />
        <DecisionTimeChart data={data} meta={meta} />
      </div>
    </div>
  );
}

function DailyChart({ data }: { data: Accuracy }) {
  const rows = data.daily.map((d) => ({ ...d, label: fmtDay(d.delivery_date, { weekday: undefined }) }));
  const yTicks = niceTicks(0, Math.max(...data.daily.flatMap((d) => [d.forecast_mwh, d.actual_mwh])));
  return (
    <Card
      title="Daily wind energy"
      actions={
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <Legend
            items={[
              { key: "f", label: "Elexon forecast", color: "var(--elexon)" },
              { key: "c", label: "Calibrated", color: "var(--calibrated)" },
              { key: "a", label: "Actual", color: "var(--actual)" },
            ]}
          />
          <button className="btn" onClick={() => downloadCsv(`windsight-daily-${data.decision_time.replace(":", "")}.csv`, data.daily as unknown as Record<string, unknown>[])}>
            <Icon name="download" />
            CSV
          </button>
        </div>
      }
    >
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="label" {...xAxisProps} interval="preserveStartEnd" minTickGap={24} />
          <YAxis {...axisProps} tickFormatter={(v) => `${v / 1000} GWh`} width={68} ticks={yTicks} domain={[0, yTicks[yTicks.length - 1]]} />
          <Tooltip
            cursor={{ stroke: "var(--axis)" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const r = payload[0].payload as (typeof rows)[number];
              return (
                <Tip
                  title={fmtDay(r.delivery_date, { weekday: "long" })}
                  rows={[
                    { label: "Elexon forecast", value: fmtGWh(r.forecast_mwh), color: "var(--elexon)" },
                    { label: "Calibrated", value: fmtGWh(r.calibrated_mwh), color: "var(--calibrated)" },
                    { label: "Actual", value: fmtGWh(r.actual_mwh), color: "var(--actual)" },
                  ]}
                  extra={[
                    { label: "Hourly MAE (Elexon)", value: fmtGW(r.mae_mw, 2) },
                    { label: "Hourly MAE (calibrated)", value: fmtGW(r.calibrated_mae_mw, 2) },
                    { label: "Worst hourly shortfall", value: fmtGW(r.max_shortfall_mw, 2) },
                  ]}
                />
              );
            }}
          />
          <Line dataKey="forecast_mwh" stroke="var(--elexon)" strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line dataKey="calibrated_mwh" stroke="var(--calibrated)" strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line dataKey="actual_mwh" stroke="var(--actual)" strokeWidth={2} dot={{ r: 2.5, fill: "var(--actual)", strokeWidth: 0 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}

function HistogramChart({ data }: { data: Accuracy }) {
  const rows = data.histogram.map((b) => ({ ...b, mid: (b.bin_start_mw + b.bin_end_mw) / 2 }));
  const total = rows.reduce((a, b) => a + b.count, 0);
  const lo = rows[0]?.bin_start_mw ?? 0;
  const hi = rows[rows.length - 1]?.bin_end_mw ?? 0;
  const xTicks = niceTicks(lo, hi, 6).filter((t) => t >= lo && t <= hi);
  return (
    <Card
      title="How big are the misses?"
      sub="Hourly error, actual − forecast."
      actions={
        <Legend
          items={[
            { key: "s", label: "Shortfall", color: "var(--shortfall)", kind: "area" },
            { key: "p", label: "Surplus", color: "var(--surplus)", kind: "area" },
          ]}
        />
      }
    >
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap={2}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="mid" type="number" domain={[lo, hi]} ticks={xTicks} {...xAxisProps} tickFormatter={(v) => fmtSigned(v, "GW", 0)} />
          <YAxis {...axisProps} width={36} allowDecimals={false} />
          <ReferenceLine x={0} stroke="var(--muted)" />
          <Tooltip
            cursor={{ fill: "var(--surface-2)" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const r = payload[0].payload as (typeof rows)[number];
              return (
                <Tip
                  title={`${fmtSigned(r.bin_start_mw, "GW", 1)} to ${fmtSigned(r.bin_end_mw, "GW", 1)}`}
                  rows={[
                    { label: "Hours", value: `${r.count}` },
                    { label: "Share", value: fmtPct((r.count / total) * 100, 1) },
                  ]}
                />
              );
            }}
          />
          <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false}>
            {rows.map((r) => (
              <Cell key={r.bin_start_mw} fill={r.bin_end_mw <= 0 ? "var(--shortfall)" : "var(--surplus)"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}

function HourChart({ data }: { data: Accuracy }) {
  const rows = data.by_hour.map((h) => ({ ...h, label: `${String(h.hour).padStart(2, "0")}:00` }));
  const yTicks = niceTicks(0, Math.max(...data.by_hour.map((h) => h.mae_mw)), 4);
  return (
    <Card
      title="Error by hour of day"
      actions={
        <Legend
          items={[
            { key: "e", label: "Elexon", color: "var(--elexon)", kind: "area" },
            { key: "c", label: "Calibrated", color: "var(--calibrated)", kind: "area" },
          ]}
        />
      }
    >
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2} barCategoryGap="20%">
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="label" {...xAxisProps} interval={3} />
          <YAxis {...axisProps} tickFormatter={tickGW} width={56} ticks={yTicks} domain={[0, yTicks[yTicks.length - 1]]} />
          <Tooltip
            cursor={{ fill: "var(--surface-2)" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const r = payload[0].payload as (typeof rows)[number];
              return (
                <Tip
                  title={`${r.label} UK · ~${r.mean_lead_hours.toFixed(0)} h ahead`}
                  rows={[
                    { label: "MAE Elexon", value: fmtMW(r.mae_mw), color: "var(--elexon)" },
                    { label: "MAE calibrated", value: fmtMW(r.calibrated_mae_mw), color: "var(--calibrated)" },
                  ]}
                  extra={[
                    { label: "Bias", value: fmtMW(r.bias_mw) },
                    { label: "P10 / P90 error", value: `${tickK(Math.round(r.p10_error_mw))} / ${tickK(Math.round(r.p90_error_mw))} MW` },
                  ]}
                />
              );
            }}
          />
          <Bar dataKey="mae_mw" fill="var(--elexon)" radius={[4, 4, 0, 0]} maxBarSize={12} isAnimationActive={false} />
          <Bar dataKey="calibrated_mae_mw" fill="var(--calibrated)" radius={[4, 4, 0, 0]} maxBarSize={12} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}

function LeadTimeChart({ data }: { data: Accuracy }) {
  const rows = data.lead_time.map((r) => ({ ...r, mid: (r.lead_from_h + r.lead_to_h) / 2 }));
  const yTicks = niceTicks(0, Math.max(...rows.map((r) => r.p90_abs_error_mw)), 4);
  return (
    <Card
      title="Accuracy vs forecast horizon"
      sub="Shaded: the horizon a day-ahead purchase relies on."
      actions={
        <Legend
          items={[
            { key: "mae", label: "MAE", color: "var(--elexon)" },
            { key: "p90", label: "P90 absolute error", color: "var(--run-earlier)" },
          ]}
        />
      }
    >
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid {...gridProps} />
          <ReferenceArea x1={15} x2={39} fill="var(--band)" fillOpacity={1} ifOverflow="extendDomain" />
          <XAxis dataKey="mid" type="number" domain={[0, 72]} ticks={[0, 12, 24, 36, 48, 60, 72]} {...xAxisProps} unit="h" />
          <YAxis {...axisProps} tickFormatter={tickGW} width={56} ticks={yTicks} domain={[0, yTicks[yTicks.length - 1]]} />
          <Tooltip
            cursor={{ stroke: "var(--axis)" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const r = payload[0].payload as (typeof rows)[number];
              return (
                <Tip
                  title={`${r.lead_from_h}–${r.lead_to_h} h ahead`}
                  rows={[
                    { label: "MAE", value: fmtMW(r.mae_mw), color: "var(--elexon)" },
                    { label: "P90 abs error", value: fmtMW(r.p90_abs_error_mw), color: "var(--run-earlier)" },
                    { label: "Bias", value: fmtMW(r.bias_mw) },
                    { label: "Hours scored", value: r.n.toLocaleString("en-GB") },
                  ]}
                />
              );
            }}
          />
          <Line dataKey="p90_abs_error_mw" stroke="var(--run-earlier)" strokeWidth={2} dot={{ r: 3, strokeWidth: 0, fill: "var(--run-earlier)" }} isAnimationActive={false} />
          <Line dataKey="mae_mw" stroke="var(--elexon)" strokeWidth={2} dot={{ r: 3, strokeWidth: 0, fill: "var(--elexon)" }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}

function DecisionTimeChart({ data, meta }: { data: Accuracy; meta: Meta }) {
  const rows = data.decision_time_sensitivity;
  const maes = rows.map((r) => r.mae_mw);
  const yTicks = niceTicks(Math.min(...maes) - 50, Math.max(...maes) + 50, 4);
  return (
    <Card
      title="Does deciding later help?"
      sub="Forecast error by decision time on D-1. Dashed lines: auction gate closures."
    >
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="decision_time" {...xAxisProps} interval={5} />
          <YAxis {...axisProps} tickFormatter={(v) => tickGW(v)} width={56} ticks={yTicks} domain={[yTicks[0], yTicks[yTicks.length - 1]]} />
          {meta.decision_presets.map((p, i) => (
            <ReferenceLine
              key={p.id}
              x={snap(rows, p.time)}
              stroke="var(--muted)"
              strokeDasharray="3 3"
              label={{
                value: `${p.id.toUpperCase()} ${p.time}`,
                position: i === 0 ? "insideTopRight" : "insideTopLeft",
                fill: "var(--ink-2)",
                fontSize: 11,
              }}
            />
          ))}
          <Tooltip
            cursor={{ stroke: "var(--axis)" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const r = payload[0].payload as (typeof rows)[number];
              return <Tip title={`Decide at ${r.decision_time} on D-1`} rows={[{ label: "MAE", value: fmtMW(r.mae_mw), color: "var(--elexon)" }]} />;
            }}
          />
          <Line type="stepAfter" dataKey="mae_mw" stroke="var(--elexon)" strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}

/** Snap a HH:MM to the sensitivity grid point at or before it (category axis). */
function snap(rows: { decision_time: string }[], t: string): string | undefined {
  return [...rows].reverse().find((r) => r.decision_time <= t)?.decision_time;
}
