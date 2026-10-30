import { Monitor } from "lucide-react";
import { useDashboardTheme, type ThemePreference } from "../dashboard-theme";
import { fr } from "../i18n/fr";

const THEME_OPTIONS: Array<{ value: ThemePreference; label: string }> = [
  { value: "system", label: "Système" },
  { value: "light", label: "Clair" },
  { value: "dark", label: "Sombre" },
];

// The Web DashboardThemeControl: system / light / dark.
export function ThemeControl() {
  const { preference, setPreference } = useDashboardTheme();
  return (
    <label className="relative inline-flex h-11 shrink-0 items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 text-sm text-[var(--ink)]">
      <Monitor className="h-4 w-4 shrink-0 text-[var(--ink-faint)]" aria-hidden="true" />
      <span className="sr-only">{fr.account.theme}</span>
      <select
        aria-label={fr.account.theme}
        className="max-w-28 cursor-pointer bg-transparent py-2 text-xs font-medium outline-none"
        value={preference}
        onChange={(event) => setPreference(event.target.value as ThemePreference)}
      >
        {THEME_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}
