// Formatting helpers. All user-facing times are UK local (Europe/London).

const UK = "Europe/London";

export const fmtMW = (v: number | null | undefined, digits = 0): string =>
  v == null ? "–" : `${v.toLocaleString("en-GB", { maximumFractionDigits: digits })} MW`;

export const fmtGW = (mw: number | null | undefined, digits = 1): string =>
  mw == null ? "–" : `${(mw / 1000).toFixed(digits)} GW`;

/** Hourly MW summed over a day is MWh; show as GWh. */
export const fmtGWh = (mwh: number | null | undefined, digits = 0): string =>
  mwh == null
    ? "–"
    : `${(mwh / 1000).toLocaleString("en-GB", { maximumFractionDigits: digits })} GWh`;

export const fmtPct = (v: number | null | undefined, digits = 0): string =>
  v == null ? "–" : `${v.toFixed(digits)}%`;

export const fmtSigned = (v: number, unit = "GW", digits = 1): string => {
  const x = unit === "GW" ? v / 1000 : v;
  return `${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(x).toFixed(digits)} ${unit}`;
};

/** Compact axis tick: 12000 -> "12k". */
export const tickK = (v: number): string =>
  Math.abs(v) >= 1000 ? `${(v / 1000).toLocaleString("en-GB", { maximumFractionDigits: 1 })}k` : `${v}`;

/** MW axis tick shown in GW: 15000 -> "15 GW". */
export const tickGW = (mw: number): string =>
  `${(mw / 1000).toLocaleString("en-GB", { maximumFractionDigits: 1 })} GW`;

/** Evenly spaced "nice" ticks (1/2/2.5/5 x 10^n) covering [min, max]. */
export function niceTicks(min: number, max: number, target = 5): number[] {
  if (!(max > min)) return [min];
  const raw = (max - min) / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const ticks: number[] = [];
  for (let v = Math.floor(min / step) * step; v < max + step; v += step) {
    ticks.push(Math.round(v * 1e6) / 1e6);
    if (v >= max) break;
  }
  return ticks;
}

export const fmtDay = (isoDate: string, opts: Intl.DateTimeFormatOptions = {}): string =>
  new Date(`${isoDate}T12:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: UK,
    ...opts,
  });

export const fmtTime = (iso: string): string =>
  new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: UK });

export const fmtDateTime = (iso: string): string =>
  new Date(iso).toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: UK,
  });

export const shiftDay = (isoDate: string, days: number): string => {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** Turn rows into a CSV string (RFC 4180 quoting). */
export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}

export function downloadCsv(filename: string, rows: Record<string, unknown>[]): void {
  const blob = new Blob([toCsv(rows)], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
