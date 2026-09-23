"use client";

import { Monitor } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";

import { type TranslationFunction } from "@/lib/i18n";

const subscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

export function DashboardThemeControl({ t }: { t: TranslationFunction }) {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);

  return (
    <label className="relative inline-flex h-11 shrink-0 items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 text-sm text-[var(--ink)]">
      <Monitor className="h-4 w-4 shrink-0 text-[var(--ink-faint)]" aria-hidden="true" />
      <span className="sr-only">{t("dashboard.common.theme.label")}</span>
      <select
        aria-label={t("dashboard.common.theme.label")}
        className="max-w-28 cursor-pointer bg-transparent py-2 text-xs font-medium outline-none disabled:opacity-50"
        value={mounted ? theme ?? "system" : "system"}
        disabled={!mounted}
        onChange={(event) => setTheme(event.target.value)}
      >
        <option value="system">{t("dashboard.common.theme.system")}</option>
        <option value="light">{t("dashboard.common.theme.light")}</option>
        <option value="dark">{t("dashboard.common.theme.dark")}</option>
      </select>
    </label>
  );
}
