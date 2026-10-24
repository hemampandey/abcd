import { useMemo, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, type DayView as Day, type Meta, type Run } from "../api";
import { Card, ErrorState, Icon, Kpi, Legend, Loading, Tip, axisProps, gridProps, xAxisProps } from "../components/ui";
import {
  downloadCsv,
  fmtDateTime,
  fmtDay,
  fmtGWh,
  fmtMW,
  fmtPct,
  fmtTime,
  niceTicks,
  tickGW,
  tickK,
} from "../format";
import { useFetch } from "../useFetch";

const SERIES = [
  { key: "band", label: "P10–P90 range", color: "var(--band)", kind: "area" as const },
  { key: "calibrated", label: "Calibrated forecast", color: "var(--calibrated)" },
  { key: "forecast", label: "Elexon forecast", color: "var(--elexon)" },
  { key: "actual", label: "Actual", color: "var(--actual)" },
];

export function DayView({
  meta,
  day,
  setDay,
  decisionTime,
}: {
  meta: Meta;
  day: string;
  setDay: (d: string) => void;
  decisionTime: string;
}) {
  const { data, error, loading } = useFetch((s) => api.day(day, decisionTime, s), [day, decisionTime]);
  const days = meta.delivery_days;
  const idx = days.indexOf(day);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Day-ahead wind position</h1>
        </div>
        <div className="toolbar" aria-label="Delivery day">
          <button className="icon-btn" onClick={() => setDay(days[idx - 1])} disabled={idx <= 0} aria-label="Previous day">
            <Icon name="left" />
          </button>
          <select value={day} onChange={(e) => setDay(e.target.value)} aria-label="Delivery day">
            {days.map((d) => (
              <option key={d} value={d}>
                {fmtDay(d)}
              </option>
            ))}
          </select>
          <button
            className="icon-btn"
            onClick={() => setDay(days[idx + 1])}
            disabled={idx >= days.length - 1}
            aria-label="Next day"
          >
            <Icon name="right" />
          </button>
        </div>
      </div>

      {error && <ErrorState error={error} />}
      {loading && !data && <Loading height={520} />}
      {data && <DayBody data={data} meta={meta} stale={loading} />}
    </>
  );
}

function DayBody({ data, meta, stale }: { data: Day; meta: Meta; stale: boolean }) {
  const s = data.summary;
  const [lo, hi] = meta.band_quantiles.map((q) => Math.round(q * 100));
  const shortfallRisk = s.calibrated_mwh != null && s.low_case_mwh != null ? s.calibrated_mwh - s.low_case_mwh : null;
  const calGain =
    s.mae_mw && s.calibrated_mae_mw != null ? ((s.mae_mw - s.calibrated_mae_mw) / s.mae_mw) * 100 : null;

  return (
    <div className="stack" aria-busy={stale}>
      <div className="meta" role="note">
        <span className="meta-item">
          <span className="meta-label">Decision</span>
          <b>{fmtDateTime(data.decision_cutoff)}</b>
        </span>
        <span className="meta-item">
          <span className="dot" style={{ background: "var(--elexon)" }} aria-hidden />
          <span className="meta-label">Forecast used</span>
          <b>{data.forecast_publish_time ? fmtDateTime(data.forecast_publish_time) : "none available"}</b>
        </span>
      </div>

      <div className="kpis">
        <Kpi
          label="Expected wind"
          color="var(--calibrated)"
          value={fmtGWh(s.calibrated_mwh)}
        />
        <Kpi
          label={`Low-wind case (P${lo})`}
          color="var(--calibrated)"
          value={fmtGWh(s.low_case_mwh)}
          sub={
            shortfallRisk != null && (
              <>
                {fmtGWh(shortfallRisk)} below expected
              </>
            )
          }
        />
        <Kpi
          label="Elexon forecast"
          color="var(--elexon)"
          value={fmtGWh(s.forecast_mwh)}
        />
        <Kpi
          label="Actual"
          hindsight
          value={fmtGWh(s.actual_mwh)}
          sub={
            calGain != null && (
              <>
                Calibrated error{" "}
                <span className={calGain > 0 ? "good" : undefined}>
                  {fmtPct(Math.abs(calGain))} {calGain > 0 ? "lower" : "higher"}
                </span>{" "}
                than Elexon
              </>
            )
          }
        />
      </div>

      <MainChart data={data} lo={lo} hi={hi} />
      <EvolutionChart data={data} />
      <HourlyTable data={data} />
    </div>
  );
}

function MainChart({ data, lo, hi }: { data: Day; lo: number; hi: number }) {
  const [visible, setVisible] = useState<Record<string, boolean>>({
    band: true,
    calibrated: true,
    forecast: true,
    actual: true,
  });
  const rows = data.hours.map((h) => ({
    t: h.local_time,
    forecast: h.forecast_mw,
    calibrated: h.calibrated_mw,
    band: h.band_low_mw != null && h.band_high_mw != null ? [h.band_low_mw, h.band_high_mw] : null,
    actual: h.actual_mw,
    lead: h.lead_hours,
  }));
  const yTicks = niceTicks(
    0,
    Math.max(...data.hours.flatMap((h) => [h.forecast_mw, h.band_high_mw, h.actual_mw].filter((v): v is number => v != null))),
  );

  return (
    <Card
      title="Hourly wind generation"
      actions={
        <Legend
          items={SERIES.map((s) => ({ ...s, label: s.key === "band" ? `P${lo}–P${hi} range` : s.label }))}
          visible={visible}
          onToggle={(k) => setVisible((v) => ({ ...v, [k]: !v[k] }))}
        />
      }
    >
      <ResponsiveContainer width="100%" height={340}>
        <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="t" {...xAxisProps} interval={2} />
          <YAxis {...axisProps} tickFormatter={tickGW} width={56} ticks={yTicks} domain={[0, yTicks[yTicks.length - 1]]} />
          <Tooltip
            cursor={{ stroke: "var(--axis)" }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const r = payload[0].payload as (typeof rows)[number];
              return (
                <Tip
                  title={`${label} UK · ${r.lead?.toFixed(1) ?? "–"} h ahead`}
                  rows={[
                    { label: "Elexon forecast", value: fmtMW(r.forecast), color: "var(--elexon)" },
                    { label: "Calibrated", value: fmtMW(r.calibrated), color: "var(--calibrated)" },
                    {
                      label: `P${lo}–P${hi}`,
                      value: r.band ? `${tickK(Math.round(r.band[0]))}–${tickK(Math.round(r.band[1]))} MW` : "–",
                      color: "var(--band)",
                    },
                  ]}
                  extra={
                    r.actual != null
                      ? [
                          { label: "Actual", value: fmtMW(r.actual), color: "var(--actual)" },
                          {
                            label: "Elexon error",
                            value: r.forecast != null ? fmtMW(r.actual - r.forecast) : "–",
                          },
                        ]
                      : []
                  }
                />
              );
            }}
          />
          {visible.band && <Area dataKey="band" stroke="none" fill="var(--band)" fillOpacity={1} isAnimationActive={false} />}
          {visible.forecast && (
            <Line dataKey="forecast" stroke="var(--elexon)" strokeWidth={2} dot={false} isAnimationActive={false} />
          )}
          {visible.calibrated && (
            <Line dataKey="calibrated" stroke="var(--calibrated)" strokeWidth={2} dot={false} isAnimationActive={false} />
          )}
          {visible.actual && (
            <Line dataKey="actual" stroke="var(--actual)" strokeWidth={2} dot={false} isAnimationActive={false} />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </Card>
  );
}

function EvolutionChart({ data }: { data: Day }) {
  const { rows, runs } = useMemo(() => pivotRuns(data), [data]);
  // Draw order: runs after the gate at the back, the run actually used on top.
  const order: Record<Run["status"], number> = { after_cutoff: 0, earlier: 1, used: 2 };
  const sorted = runs.map((r, i) => ({ ...r, key: `r${i}` })).sort((a, b) => order[a.status] - order[b.status]);
  const used = runs.find((r) => r.status === "used");
  const yTicks = niceTicks(
    0,
    Math.max(...rows.flatMap((r) => Object.entries(r).filter(([k]) => k !== "t").map(([, v]) => (typeof v === "number" ? v : 0)))),
  );

  return (
    <Card
      title="How the forecast evolved"
      sub="Every Elexon run for this day. The highlighted one was available at gate closure."
      actions={
        <Legend
          items={[
            { key: "used", label: `Used (${used ? fmtTime(used.publish_time) : "–"})`, color: "var(--elexon)" },
            { key: "earlier", label: "Earlier runs", color: "var(--run-earlier)", kind: "thin" },
            { key: "late", label: "Published after gate", color: "var(--run-late)", kind: "dashed" },
            { key: "actual", label: "Actual", color: "var(--actual)" },
          ]}
        />
      }
    >
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="t" {...xAxisProps} interval={2} />
          <YAxis {...axisProps} tickFormatter={tickGW} width={56} ticks={yTicks} domain={[0, yTicks[yTicks.length - 1]]} />
          <Tooltip
            cursor={{ stroke: "var(--axis)" }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const r = payload[0].payload as Record<string, number | string | null>;
              const vals = (status: Run["status"]) =>
                sorted.filter((x) => x.status === status).map((x) => r[x.key] as number | null).filter((v): v is number => v != null);
              const earlier = vals("earlier");
              const late = vals("after_cutoff");
              const range = (v: number[]) => (v.length ? `${tickK(Math.min(...v))}–${tickK(Math.max(...v))} MW` : "–");
              return (
                <Tip
                  title={`${label} UK`}
                  rows={[
                    { label: "Used at gate", value: fmtMW(vals("used")[0]), color: "var(--elexon)" },
                    { label: `Earlier runs (${earlier.length})`, value: range(earlier), color: "var(--run-earlier)" },
                    { label: `Later runs (${late.length})`, value: range(late), color: "var(--run-late)" },
                  ]}
                  extra={r.actual != null ? [{ label: "Actual", value: fmtMW(r.actual as number), color: "var(--actual)" }] : []}
                />
              );
            }}
          />
          {sorted.map((r) => (
            <Line
              key={r.key}
              dataKey={r.key}
              stroke={r.status === "used" ? "var(--elexon)" : r.status === "earlier" ? "var(--run-earlier)" : "var(--run-late)"}
              strokeWidth={r.status === "used" ? 2.5 : 1.25}
              strokeDasharray={r.status === "after_cutoff" ? "4 3" : undefined}
              dot={false}
              isAnimationActive={false}
              connectNulls
            />
          ))}
          <Line dataKey="actual" stroke="var(--actual)" strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}

function pivotRuns(data: Day) {
  const byTime = new Map<string, Record<string, number | string | null>>();
  for (const h of data.hours) byTime.set(normalise(h.start_time), { t: h.local_time, actual: h.actual_mw });
  data.runs.forEach((run, i) => {
    for (const p of run.points) {
      const row = byTime.get(normalise(p.start_time));
      if (row) row[`r${i}`] = p.forecast_mw;
    }
  });
  return { rows: [...byTime.values()], runs: data.runs };
}

// Hours and run points come from the same API but via different serializers;
// normalise ISO strings so "…:00Z" and "…:00+00:00" match.
const normalise = (iso: string) => new Date(iso).toISOString().replace(".000Z", "Z");

function HourlyTable({ data }: { data: Day }) {
  const rows = data.hours.map((h) => ({
    hour_uk: h.local_time,
    elexon_forecast_mw: h.forecast_mw,
    calibrated_mw: h.calibrated_mw && Math.round(h.calibrated_mw),
    p10_mw: h.band_low_mw && Math.round(h.band_low_mw),
    p90_mw: h.band_high_mw && Math.round(h.band_high_mw),
    actual_mw: h.actual_mw,
    error_mw: h.error_mw,
    lead_hours: h.lead_hours,
  }));
  return (
    <Card
      title="Hourly detail"
      actions={
        <button className="btn" onClick={() => downloadCsv(`windsight-${data.delivery_date}-${data.decision_time.replace(":", "")}.csv`, rows)}>
          <Icon name="download" />
          CSV
        </button>
      }
    >
      <details className="table-wrap">
        <summary>
          <Icon name="right" />
          Show {rows.length} hours
        </summary>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Hour (UK)</th>
                <th>Elexon MW</th>
                <th>Calibrated MW</th>
                <th>P10 MW</th>
                <th>P90 MW</th>
                <th>Actual MW</th>
                <th>Error MW</th>
                <th>Lead h</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.hour_uk}>
                  <td>{r.hour_uk}</td>
                  <td>{r.elexon_forecast_mw?.toLocaleString("en-GB") ?? "–"}</td>
                  <td>{r.calibrated_mw?.toLocaleString("en-GB") ?? "–"}</td>
                  <td>{r.p10_mw?.toLocaleString("en-GB") ?? "–"}</td>
                  <td>{r.p90_mw?.toLocaleString("en-GB") ?? "–"}</td>
                  <td>{r.actual_mw?.toLocaleString("en-GB") ?? "–"}</td>
                  <td className={r.error_mw != null && r.error_mw < 0 ? "neg" : undefined}>
                    {r.error_mw?.toLocaleString("en-GB") ?? "–"}
                  </td>
                  <td>{r.lead_hours?.toFixed(1) ?? "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </Card>
  );
}
