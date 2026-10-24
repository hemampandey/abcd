// Typed client for the FastAPI backend. Shapes mirror backend/app/schemas.py.

export interface DecisionPreset {
  id: string;
  label: string;
  time: string;
  description: string;
}

export interface Meta {
  delivery_days: string[];
  decision_month: string;
  decision_presets: DecisionPreset[];
  default_decision_time: string;
  band_quantiles: [number, number];
  band_lookback_days: number;
  data_refreshed_at: string;
  sources: Record<string, string>;
}

export interface Hour {
  start_time: string;
  local_time: string;
  forecast_mw: number | null;
  calibrated_mw: number | null;
  band_low_mw: number | null;
  band_high_mw: number | null;
  actual_mw: number | null;
  error_mw: number | null;
  lead_hours: number | null;
}

export type RunStatus = "used" | "earlier" | "after_cutoff";

export interface Run {
  publish_time: string;
  status: RunStatus;
  points: { start_time: string; forecast_mw: number }[];
}

export interface DayView {
  delivery_date: string;
  decision_time: string;
  decision_cutoff: string;
  forecast_publish_time: string | null;
  calibration: {
    scale: number | null;
    ratio_low: number | null;
    ratio_high: number | null;
    hours: number;
    window_from: string;
    window_to: string;
  };
  summary: {
    forecast_mwh: number;
    calibrated_mwh: number | null;
    low_case_mwh: number | null;
    high_case_mwh: number | null;
    actual_mwh: number | null;
    peak_forecast_mw: number;
    min_forecast_mw: number;
    mae_mw: number | null;
    calibrated_mae_mw: number | null;
    max_shortfall_mw: number | null;
  };
  hours: Hour[];
  runs: Run[];
}

export interface Metrics {
  n: number;
  mae_mw: number;
  rmse_mw: number;
  bias_mw: number;
  nmae_pct: number;
  p50_abs_error_mw: number;
  p90_abs_error_mw: number;
  p10_error_mw: number;
  p90_error_mw: number;
  max_shortfall_mw: number;
  max_surplus_mw: number;
  mean_actual_mw: number;
  mean_forecast_mw: number;
  calibrated_mae_mw?: number;
  calibrated_bias_mw?: number;
  band_coverage_pct?: number;
  band_mean_width_mw?: number;
}

export interface DailyRow {
  delivery_date: string;
  forecast_mwh: number;
  calibrated_mwh: number | null;
  actual_mwh: number;
  mae_mw: number;
  calibrated_mae_mw: number | null;
  bias_mw: number;
  max_shortfall_mw: number;
}

export interface HourRow {
  hour: number;
  mae_mw: number;
  calibrated_mae_mw: number | null;
  bias_mw: number;
  p10_error_mw: number;
  p90_error_mw: number;
  mean_lead_hours: number;
}

export interface Accuracy {
  decision_time: string;
  date_from: string;
  date_to: string;
  metrics: Metrics;
  daily: DailyRow[];
  by_hour: HourRow[];
  histogram: { bin_start_mw: number; bin_end_mw: number; count: number }[];
  lead_time: {
    lead_from_h: number;
    lead_to_h: number;
    mae_mw: number;
    bias_mw: number;
    p90_abs_error_mw: number;
    n: number;
  }[];
  decision_time_sensitivity: { decision_time: string; mae_mw: number }[];
}

const BASE = import.meta.env.VITE_API_URL ?? "";

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { signal });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
    } catch {
      /* non-JSON error body */
    }
    throw new Error(`${res.status}: ${detail}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  meta: (signal?: AbortSignal) => get<Meta>("/api/meta", signal),
  day: (date: string, decisionTime: string, signal?: AbortSignal) =>
    get<DayView>(`/api/day/${date}?decision_time=${encodeURIComponent(decisionTime)}`, signal),
  accuracy: (decisionTime: string, from: string, to: string, signal?: AbortSignal) =>
    get<Accuracy>(
      `/api/accuracy?decision_time=${encodeURIComponent(decisionTime)}&date_from=${from}&date_to=${to}`,
      signal,
    ),
};
