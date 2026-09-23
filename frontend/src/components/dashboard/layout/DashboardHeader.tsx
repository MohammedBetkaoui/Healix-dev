"use client";

import { useMemo } from "react";
import { CalendarDays, Menu } from "lucide-react";

import { LanguageSwitcher } from "@/components/shared/LanguageSwitcher";
import { Button } from "@/components/ui/button";
import { type Locale } from "@/i18n";
import { type Direction, type TranslationFunction } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { type DashboardUserSummary } from "@/types/dashboard";
import { DashboardThemeControl } from "./DashboardThemeControl";

type DashboardHeaderProps = {
  breadcrumbLabel?: string;
  direction: Direction;
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
  onMenuOpen: () => void;
  t: TranslationFunction;
  title: string;
  user: DashboardUserSummary;
};

export function DashboardHeader({
  breadcrumbLabel,
  direction,
  locale,
  onLocaleChange,
  onMenuOpen,
  t,
  title,
  user,
}: DashboardHeaderProps) {
  const formattedDate = useMemo(
    () =>
      new Intl.DateTimeFormat(locale === "ar" ? "ar-DZ" : "fr-DZ", {
        day: "2-digit",
        month: "short",
        weekday: "short",
      }).format(new Date()),
    [locale],
  );

  return (
    <header
      className="dashboard-chrome relative z-20 border-b border-[var(--line)]"
      aria-label={`${title} · ${user.workspaceSubtitle}`}
    >
      <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-4 px-4 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <div className="flex min-w-0 items-start gap-3">
          <Button
            variant="outline"
            size="icon"
            className="mt-0.5 shrink-0 rounded-full border-[var(--line)] bg-[var(--panel)] text-[var(--accent-dark)] lg:hidden"
            onClick={onMenuOpen}
            aria-label={t("dashboard.common.actions.menu")}
          >
            <Menu className="h-4 w-4" strokeWidth={1.8} />
          </Button>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-[0.76rem] leading-none text-[var(--ink-faint)]">
              <span className="truncate">
                {t("dashboard.common.breadcrumb.pages")} /{" "}
                {breadcrumbLabel ?? t("dashboard.common.breadcrumb.dashboard")}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent-soft)] px-2.5 py-1.5 font-[var(--font-auth-mono)] text-[0.62rem] font-medium tracking-[0.02em] text-[var(--accent-dark)]">
                <span
                  className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]"
                  aria-hidden="true"
                />
                {t("dashboard.common.header.secureWorkspace")}
              </span>
            </div>
            <h1 className="mt-1.5 break-words font-[var(--font-auth-display)] text-2xl font-semibold leading-snug text-[var(--ink)] sm:text-[1.85rem]">
              {title}
            </h1>
          </div>
        </div>

        <div
          className={cn(
            "flex shrink-0 flex-wrap items-center gap-2.5",
            direction === "rtl" ? "justify-start" : "justify-end",
          )}
        >
          <div className="hidden h-11 items-center gap-2.5 rounded-full border border-[var(--line)] bg-[var(--panel)] px-4 text-[0.78rem] font-medium text-[var(--ink-soft)] md:flex">
            <CalendarDays
              className="h-4 w-4 text-[var(--ink-faint)]"
              strokeWidth={1.7}
              aria-hidden="true"
            />
            <span className="whitespace-nowrap">{formattedDate}</span>
          </div>

          <DashboardThemeControl t={t} />
          <LanguageSwitcher
            locale={locale}
            onLocaleChange={onLocaleChange}
            t={t}
            variant="compact"
          />
        </div>
      </div>
    </header>
  );
}
