import type { ReactNode } from "react";

export function Card({
  title,
  sub,
  actions,
  children,
}: {
  title: string;
  sub?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="card">
      <div className="card-head">
        <div>
          <h2>{title}</h2>
          {sub && <p className="sub">{sub}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function Kpi({
  label,
  value,
  sub,
  color,
  hindsight,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  color?: string;
  hindsight?: boolean;
}) {
  return (
    <div className={`kpi${hindsight ? " hindsight" : ""}`}>
      <div className="kpi-label">
        {color && <span className="dot" style={{ background: color }} aria-hidden />}
        {label}
        {hindsight && <span className="pill">Hindsight</span>}
      </div>
      <div className="kpi-value">{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

export interface LegendEntry {
  key: string;
  label: string;
  color: string;
  kind?: "line" | "area" | "thin" | "dashed";
}

/** Legend that doubles as series toggles when `visible`/`onToggle` are passed. */
export function Legend({
  items,
  visible,
  onToggle,
}: {
  items: LegendEntry[];
  visible?: Record<string, boolean>;
  onToggle?: (key: string) => void;
}) {
  return (
    <div className="legend" role="list">
      {items.map((it) => {
        const swatch = (
          <span
            className={`legend-swatch ${it.kind ?? "line"}`}
            style={{
              background:
                it.kind === "dashed"
                  ? `repeating-linear-gradient(90deg, ${it.color} 0 4px, transparent 4px 7px)`
                  : it.color,
            }}
            aria-hidden
          />
        );
        return onToggle ? (
          <button
            key={it.key}
            className="legend-item"
            aria-pressed={visible?.[it.key] ?? true}
            onClick={() => onToggle(it.key)}
            role="listitem"
          >
            {swatch}
            {it.label}
          </button>
        ) : (
          <span key={it.key} className="legend-item" role="listitem">
            {swatch}
            {it.label}
          </span>
        );
      })}
    </div>
  );
}

export interface TipRow {
  label: string;
  value: string;
  color?: string;
}

export function Tip({ title, rows, extra }: { title: string; rows: TipRow[]; extra?: TipRow[] }) {
  const row = (r: TipRow) => (
    <div className="tt-row" key={r.label}>
      <span>
        {r.color && <span className="legend-swatch" style={{ background: r.color }} />}
        {r.label}
      </span>
      <b>{r.value}</b>
    </div>
  );
  return (
    <div className="tt">
      <div className="tt-title">{title}</div>
      {rows.map(row)}
      {extra && extra.length > 0 && (
        <>
          <div className="tt-sep" />
          {extra.map(row)}
        </>
      )}
    </div>
  );
}

export function Loading({ height = 320 }: { height?: number }) {
  return <div className="skeleton" style={{ height }} aria-busy="true" aria-label="Loading" />;
}

export function ErrorState({ error }: { error: Error }) {
  return (
    <div className="state error" role="alert">
      Could not load data: {error.message}
      <button className="btn" onClick={() => window.location.reload()}>
        Try again
      </button>
    </div>
  );
}

/** Minimal stroke icons (Lucide geometry, 1.75px stroke) so we ship no icon font. */
const PATHS = {
  left: "m15 18-6-6 6-6",
  right: "m9 18 6-6-6-6",
  download: "M12 15V3m0 12-4-4m4 4 4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2",
  sun: "M12 8a4 4 0 1 0 0 8 4 4 0 1 0 0-8M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41",
  moon: "M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z",
} as const;

export function Icon({ name, label }: { name: keyof typeof PATHS; label?: string }) {
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? "img" : undefined}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

export function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" aria-hidden>
      <path d="M12 12V3.5c2.2 0 3 2.6 0 8.5Z" />
      <path d="M12 12l7.4 4.25c-1.1 1.9-3.75 1.3-7.4-4.25Z" />
      <path d="M12 12l-7.4 4.25c-1.1-1.9.75-3.9 7.4-4.25Z" />
      <path d="M12 12v9" />
    </svg>
  );
}

/** Shared axis/grid props so every chart has the same recessive chrome. */
export const axisProps = {
  stroke: "var(--axis)",
  axisLine: false,
  tickLine: false,
  tick: { fill: "var(--muted)", fontSize: 11.5 },
  tickMargin: 8,
} as const;

export const xAxisProps = { ...axisProps, axisLine: { stroke: "var(--axis)" } } as const;

export const gridProps = { stroke: "var(--grid)", vertical: false } as const;
