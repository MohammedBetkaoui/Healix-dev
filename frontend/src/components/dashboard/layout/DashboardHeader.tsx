"use client";

import { useMemo } from "react";
import {
  Building2,
  CalendarDays,
  Menu,
  ShieldCheck,
  Stethoscope,
} from "lucide-react";

import { LanguageSwitcher } from "@/components/shared/LanguageSwitcher";
import { Button } from "@/components/ui/button";
import { type Locale } from "@/i18n";
import { type Direction, type TranslationFunction } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { type DashboardUserSummary } from "@/types/dashboard";

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
  const WorkspaceIcon =
    user.accountType === "ESTABLISHMENT" ? Building2 : Stethoscope;
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
    <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/90 shadow-[0_1px_0_rgba(15,23,42,0.03)] backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              variant="outline"
              size="icon"
              className="shrink-0 rounded-2xl border-slate-200 bg-white shadow-sm lg:hidden"
              onClick={onMenuOpen}
              aria-label={t("dashboard.common.actions.menu")}
            >
              <Menu className="h-4 w-4" />
            </Button>

            <span className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-cyan-100 bg-cyan-50 text-[#0b3b5f] shadow-sm sm:flex">
              <WorkspaceIcon className="h-5 w-5" aria-hidden="true" />
            </span>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500">
                <span className="truncate">
                  {t("dashboard.common.breadcrumb.pages")} /{" "}
                  {breadcrumbLabel ?? t("dashboard.common.breadcrumb.dashboard")}
                </span>
                <span className="hidden h-1 w-1 rounded-full bg-slate-300 sm:inline-flex" />
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-emerald-700">
                  <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                  {t("dashboard.common.header.secureWorkspace")}
                </span>
              </div>
              <h1 className="mt-1 truncate text-2xl font-semibold tracking-tight text-slate-950 md:text-[1.7rem]">
                {title}
              </h1>
            </div>
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-3 md:flex-row md:items-center xl:max-w-[520px] xl:justify-end">
            <div
              className={cn(
                "flex min-w-0 items-center gap-2 sm:gap-2.5",
                direction === "rtl" ? "justify-start" : "justify-end",
              )}
            >
              <div className="hidden h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 shadow-sm md:flex">
                <CalendarDays className="h-4 w-4 text-cyan-700" aria-hidden="true" />
                <span className="whitespace-nowrap">{formattedDate}</span>
              </div>

              <div className="hidden sm:block">
                <LanguageSwitcher
                  locale={locale}
                  onLocaleChange={onLocaleChange}
                  t={t}
                  variant="compact"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
