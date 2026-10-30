import { useCallback, useEffect, useState } from "react";

// Same contract as the Web (next-themes in app/providers.tsx): the preference
// is "system", "light" or "dark", stored under the same key, and the resolved
// value is the `data-dashboard-theme` attribute dashboard-theme.css reads.
export type ThemePreference = "system" | "light" | "dark";

const STORAGE_KEY = "healixdz.dashboard.theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

function readPreference(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") return stored;
  } catch {
    // Storage can be unavailable: the dashboard then follows the system.
  }
  return "system";
}

function applyPreference(preference: ThemePreference) {
  const dark = preference === "dark" || (preference === "system" && window.matchMedia(DARK_QUERY).matches);
  document.documentElement.setAttribute("data-dashboard-theme", dark ? "dark" : "light");
}

// Called before the first render so the dashboard never flashes the wrong theme.
export function initDashboardTheme() {
  applyPreference(readPreference());
}

export function useDashboardTheme() {
  const [preference, setPreference] = useState<ThemePreference>(readPreference);

  useEffect(() => {
    applyPreference(preference);
    if (preference !== "system") return;
    const media = window.matchMedia(DARK_QUERY);
    const follow = () => applyPreference("system");
    media.addEventListener("change", follow);
    return () => media.removeEventListener("change", follow);
  }, [preference]);

  const update = useCallback((next: ThemePreference) => {
    setPreference(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // The choice still applies for this session.
    }
  }, []);

  return { preference, setPreference: update };
}
