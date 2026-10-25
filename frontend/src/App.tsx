import { useEffect, useState } from "react";
import { api, type Meta } from "./api";
import { BrandMark, ErrorState, Icon, Loading } from "./components/ui";
import { useFetch } from "./useFetch";
import { AccuracyView } from "./views/AccuracyView";
import { DayView } from "./views/DayView";
import { LandingView } from "./views/LandingView";
import { MethodView } from "./views/MethodView";

type View = "home" | "day" | "accuracy" | "method";

const TABS: { id: View; label: string }[] = [
  { id: "day", label: "Day-ahead" },
  { id: "accuracy", label: "Forecast accuracy" },
  { id: "method", label: "Method" },
];

/** App state lives in the URL so any view can be bookmarked or shared. */
function readUrl() {
  const q = new URLSearchParams(window.location.search);
  return {
    view: (q.get("view") as View) || "home",
    day: q.get("day"),
    time: q.get("t"),
    from: q.get("from"),
    to: q.get("to"),
  };
}

export default function App() {
  const meta = useFetch((s) => api.meta(s), []);
  return (
    <>
      {meta.error && <ErrorState error={meta.error} />}
      {meta.loading && !meta.data && (
        <main>
          <Loading height={600} />
        </main>
      )}
      {meta.data && <Shell meta={meta.data} />}
    </>
  );
}

function Shell({ meta }: { meta: Meta }) {
  const initial = readUrl();
  const days = meta.delivery_days;
  const validDay = (d: string | null) => (d && days.includes(d) ? d : null);
  const validTime = (t: string | null) => (t && /^([01]\d|2[0-3]):[0-5]\d$/.test(t) ? t : null);

  const [view, setViewState] = useState<View>(TABS.some((t) => t.id === initial.view) ? initial.view : "home");
  const setView = (v: View) => {
    setViewState(v);
    window.scrollTo({ top: 0 });
  };
  const [decisionTime, setDecisionTime] = useState(validTime(initial.time) ?? meta.default_decision_time);
  const [day, setDay] = useState(validDay(initial.day) ?? "2026-01-15");
  const [range, setRange] = useState<[string, string]>([
    validDay(initial.from) ?? days[0],
    validDay(initial.to) ?? days[days.length - 1],
  ]);

  useEffect(() => {
    if (view === "home") {
      window.history.replaceState(null, "", window.location.pathname);
      return;
    }
    const q = new URLSearchParams({ view, t: decisionTime });
    if (view === "day") q.set("day", day);
    if (view === "accuracy") {
      q.set("from", range[0]);
      q.set("to", range[1]);
    }
    window.history.replaceState(null, "", `?${q}`);
  }, [view, decisionTime, day, range]);

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="topbar">
        <div className="topbar-inner">
          <button className="brand" onClick={() => setView("home")} aria-label="WindSight home">
            <BrandMark />
            WindSight
          </button>
          <nav className="tabs" role="tablist" aria-label="Views">
            {TABS.map((t) => (
              <button key={t.id} className="tab" role="tab" aria-selected={view === t.id} onClick={() => setView(t.id)}>
                {t.label}
              </button>
            ))}
          </nav>
          <div className="spacer" />
          {(view === "day" || view === "accuracy") && <DecisionTimePicker meta={meta} value={decisionTime} onChange={setDecisionTime} />}
          <ThemeToggle />
        </div>
      </header>

      <main id="main" tabIndex={-1}>
        {view === "home" && <LandingView meta={meta} open={setView} />}
        {view === "day" && <DayView meta={meta} day={day} setDay={setDay} decisionTime={decisionTime} />}
        {view === "accuracy" && (
          <AccuracyView meta={meta} decisionTime={decisionTime} range={range} setRange={setRange} />
        )}
        {view === "method" && <MethodView meta={meta} />}
      </main>

      <footer>
        Data: Elexon BMRS, BSC Open Data Licence. Times are UK local.
      </footer>
    </>
  );
}

function DecisionTimePicker({
  meta,
  value,
  onChange,
}: {
  meta: Meta;
  value: string;
  onChange: (t: string) => void;
}) {
  const isPreset = meta.decision_presets.some((p) => p.time === value);
  const [custom, setCustom] = useState(!isPreset);
  return (
    <div className="control" title="When on the day before delivery the purchase decision is made">
      <span>Decide D-1 at</span>
      <div className="segmented" role="group" aria-label="Decision time">
        {meta.decision_presets.map((p) => (
          <button
            key={p.id}
            aria-pressed={!custom && value === p.time}
            title={p.description}
            onClick={() => {
              setCustom(false);
              onChange(p.time);
            }}
          >
            {p.id.toUpperCase()} {p.time}
          </button>
        ))}
        <button aria-pressed={custom} onClick={() => setCustom(true)}>
          Custom
        </button>
      </div>
      {custom && (
        <input
          type="time"
          value={value}
          step={600}
          aria-label="Custom decision time"
          onChange={(e) => e.target.value && onChange(e.target.value)}
        />
      )}
    </div>
  );
}

type Theme = "light" | "dark";

/** Light/dark switch. The initial theme is set in index.html; an explicit choice is
 *  saved, otherwise the app keeps following the OS setting. */
function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() =>
    document.documentElement.dataset.theme === "dark" ? "dark" : "light",
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const follow = (e: MediaQueryListEvent) => {
      let saved: string | null = null;
      try {
        saved = localStorage.getItem("theme");
      } catch {
        /* storage blocked */
      }
      if (!saved) setTheme(e.matches ? "dark" : "light");
    };
    mq.addEventListener("change", follow);
    return () => mq.removeEventListener("change", follow);
  }, []);

  const next: Theme = theme === "dark" ? "light" : "dark";
  return (
    <button
      className="icon-btn theme-toggle"
      onClick={() => {
        setTheme(next);
        try {
          localStorage.setItem("theme", next);
        } catch {
          /* storage blocked: choice lasts for this visit */
        }
      }}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
    >
      <Icon name={theme === "dark" ? "sun" : "moon"} />
    </button>
  );
}
