import { useEffect, useState } from "react";

export interface FetchState<T> {
  data: T | null;
  error: Error | null;
  loading: boolean;
}

/** Fetch on dependency change; aborts stale requests so the latest one wins. */
export function useFetch<T>(load: (signal: AbortSignal) => Promise<T>, deps: unknown[]): FetchState<T> {
  const [state, setState] = useState<FetchState<T>>({ data: null, error: null, loading: true });

  useEffect(() => {
    const ctrl = new AbortController();
    setState((s) => ({ ...s, loading: true, error: null }));
    load(ctrl.signal)
      .then((data) => setState({ data, error: null, loading: false }))
      .catch((error: Error) => {
        if (!ctrl.signal.aborted) setState({ data: null, error, loading: false });
      });
    return () => ctrl.abort();
  }, deps);

  return state;
}
