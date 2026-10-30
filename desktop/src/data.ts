import { useEffect, useState } from "react";
import { describeError } from "./errors";

export type Loaded<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
};

// Runs a read when the page opens and again whenever `deps` change; `version`
// is bumped by the app after a synchronization or a save, so every list
// refreshes itself. The previous data stays on screen while it reloads.
export function useLoad<T>(loader: () => Promise<T>, deps: unknown[]): Loaded<T> {
  const [state, setState] = useState<Loaded<T>>({ data: null, loading: true, error: null });
  useEffect(() => {
    let cancelled = false;
    setState((current) => ({ ...current, loading: true, error: null }));
    loader().then(
      (data) => {
        if (!cancelled) setState({ data, loading: false, error: null });
      },
      (cause) => {
        if (!cancelled) setState((current) => ({ ...current, loading: false, error: describeError(cause) }));
      },
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}
