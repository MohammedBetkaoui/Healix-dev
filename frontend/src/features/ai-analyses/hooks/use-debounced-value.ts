"use client";

import { useEffect, useState } from "react";

// Value that only follows `value` once it stopped changing for `delayMs`
// (patient search: one request per pause, not per keystroke).
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
