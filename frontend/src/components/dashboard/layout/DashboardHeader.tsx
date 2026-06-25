"use client";

import {
  Bell,
  Menu,
  Moon,
  SunMedium,
} from "lucide-react";

import { LanguageSwitcher } from "@/components/shared/LanguageSwitcher";
import { Button } from "@/components/ui/button";
import { type Locale } from "@/i18n";
import { type Direction, type TranslationFunction } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  type DashboardThemeMode,
  type DashboardUserSummary,
} from "@/types/dashboard";

type DashboardHeaderProps = {
  breadcrumbLabel?: string;
  direction: Direction;
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
  onMenuOpen: () => void;
  onThemeToggle: () => void;
  t: TranslationFunction;
  themeMode: DashboardThemeMode;
  title: string;
  user: DashboardUserSummary;
};

export function DashboardHeader({
  breadcrumbLabel,
  direction,
  locale,
  onLocaleChange,
  onMenuOpen,
  onThemeToggle,
  t,
  themeMode,
  title,
  user,
}: DashboardHeaderProps) {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/88 backdrop-blur">
      <div className="mx-auto flex w-full max-w-[1400px] flex-wrap items-center justify-between gap-4 px-4 py-5 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            className="lg:hidden"
            onClick={onMenuOpen}
            aria-label={t("dashboard.common.actions.menu")}
          >
            <Menu className="h-4 w-4" />
          </Button>
          <div>
            <p className="text-sm text-slate-400">
              {t("dashboard.common.breadcrumb.pages")} /{" "}
              {breadcrumbLabel ?? t("dashboard.common.breadcrumb.dashboard")}
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
              {title}
            </h1>
          </div>
        </div>

        <div
          className={cn(
            "flex flex-wrap items-center gap-2 sm:gap-3",
            direction === "rtl" && "justify-start",
          )}
        >
          <Button
            variant="outline"
            size="icon"
            aria-label={t("dashboard.common.actions.theme")}
            onClick={onThemeToggle}
            className="rounded-full"
          >
            {themeMode === "light" ? (
              <Moon className="h-4 w-4" />
            ) : (
              <SunMedium className="h-4 w-4" />
            )}
          </Button>
          <div className="hidden sm:block">
            <LanguageSwitcher
              locale={locale}
              onLocaleChange={onLocaleChange}
              t={t}
            />
          </div>
          <Button
            variant="outline"
            size="icon"
            className="rounded-full"
            aria-label={t("dashboard.common.actions.notifications")}
          >
            <Bell className="h-4 w-4" />
          </Button>
          <button
            type="button"
            className="inline-flex h-10 items-center gap-3 rounded-full border border-slate-200 bg-white px-3 text-start shadow-sm transition hover:border-slate-300"
            aria-label={t("dashboard.common.actions.profile")}
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
              {user.initials}
            </span>
            <span className="hidden min-w-0 sm:block">
              <span className="block truncate text-sm font-medium text-slate-900">
                {user.name}
              </span>
              <span className="block truncate text-xs text-slate-500">
                {t(user.roleKey)}
              </span>
            </span>
          </button>
        </div>
      </div>
    </header>
  );
}
