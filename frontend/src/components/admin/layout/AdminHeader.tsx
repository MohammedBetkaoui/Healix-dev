"use client";

import {
  Bell,
  CalendarDays,
  ChevronDown,
  Command,
  Menu,
  Search,
  ShieldCheck,
} from "lucide-react";

import { LanguageSwitcher } from "@/components/shared/LanguageSwitcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type Locale } from "@/i18n";
import { type Direction, type TranslationFunction } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type AdminHeaderProps = {
  adminEmail?: string;
  adminName?: string;
  adminRole?: string;
  breadcrumb: string;
  direction: Direction;
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
  onMenuClick: () => void;
  t: TranslationFunction;
  title: string;
};

export function AdminHeader({
  adminEmail,
  adminName,
  adminRole,
  breadcrumb,
  direction,
  locale,
  onLocaleChange,
  onMenuClick,
  t,
  title,
}: AdminHeaderProps) {
  const displayName = adminName ?? "HealixDZ Admin";
  const displayRole = adminRole ?? adminEmail ?? t("admin.header.role");
  const initials = displayName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-[#f8fafc]/92 backdrop-blur-xl">
      <div className="flex min-h-[92px] items-center gap-3 px-4 sm:px-6">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-11 w-11 rounded-2xl border-slate-200 bg-white shadow-sm lg:hidden"
          aria-label="Menu"
          onClick={onMenuClick}
        >
          <Menu className="h-4 w-4" aria-hidden="true" />
        </Button>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="hidden h-8 w-8 items-center justify-center rounded-xl border border-cyan-100 bg-cyan-50 text-cyan-700 sm:flex">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                {breadcrumb}
              </p>
              <h1 className="mt-1 truncate text-2xl font-semibold tracking-tight text-slate-950">
                {title}
              </h1>
            </div>
          </div>
        </div>

        <div className="hidden min-w-[320px] max-w-xl flex-[1.2] lg:block">
          <div className="relative">
            <Search
              className={cn(
                "absolute top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400",
                direction === "rtl" ? "right-4" : "left-4",
              )}
              aria-hidden="true"
            />
            <Input
              type="search"
              dir={direction}
              className={cn(
                "h-12 rounded-2xl border-slate-200 bg-white text-start shadow-sm shadow-slate-950/5 transition focus-visible:border-cyan-300 focus-visible:ring-cyan-100",
                direction === "rtl" ? "pr-11 pl-20" : "pl-11 pr-20",
              )}
              placeholder={t("admin.header.searchPlaceholder")}
            />
            <span
              className={cn(
                "pointer-events-none absolute top-1/2 hidden -translate-y-1/2 items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-500 xl:flex",
                direction === "rtl" ? "left-3" : "right-3",
              )}
            >
              <Command className="h-3 w-3" aria-hidden="true" />
              K
            </span>
          </div>
        </div>

        <div className="hidden items-center gap-2 xl:flex">
          <div className="inline-flex items-center gap-2 rounded-2xl border border-emerald-100 bg-emerald-50/80 px-3 py-2 text-xs font-semibold text-emerald-700">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            {t("admin.header.secureSession")}
          </div>
          <div className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 shadow-sm">
            <CalendarDays className="h-4 w-4 text-slate-400" aria-hidden="true" />
            {t("admin.header.today")}
          </div>
        </div>

        <div className="hidden xl:block">
          <LanguageSwitcher
            locale={locale}
            onLocaleChange={onLocaleChange}
            t={t}
            variant="compact"
          />
        </div>

        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={t("admin.header.notification")}
          className="relative h-11 w-11 rounded-2xl border-slate-200 bg-white shadow-sm"
        >
          <Bell className="h-4 w-4" aria-hidden="true" />
          <span
            className={cn(
              "absolute top-2 h-2.5 w-2.5 rounded-full border-2 border-white bg-cyan-500",
              direction === "rtl" ? "left-2" : "right-2",
            )}
          />
        </Button>

        <div className="hidden items-center gap-3 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm shadow-slate-950/5 md:flex">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#0b3b5f] text-sm font-bold text-white shadow-sm">
            {initials}
          </span>
          <div className="min-w-0">
            <p className="max-w-[170px] truncate text-sm font-semibold text-slate-950">
              {displayName}
            </p>
            <div className="mt-0.5 flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <p className="truncate text-xs font-semibold text-cyan-700">
                {displayRole}
              </p>
            </div>
          </div>
          <ChevronDown className="h-4 w-4 text-slate-400" aria-hidden="true" />
        </div>
      </div>
      <div className="grid gap-3 border-t border-slate-100 px-4 py-3 lg:hidden">
        <div className="relative">
          <Search
            className={cn(
              "absolute top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400",
              direction === "rtl" ? "right-3" : "left-3",
            )}
            aria-hidden="true"
          />
          <Input
            type="search"
            dir={direction}
            className={cn(
              "h-11 rounded-2xl border-slate-200 bg-white text-start shadow-sm",
              direction === "rtl" ? "pr-10" : "pl-10",
            )}
            placeholder={t("admin.header.searchPlaceholder")}
          />
        </div>
        <div className="xl:hidden">
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
