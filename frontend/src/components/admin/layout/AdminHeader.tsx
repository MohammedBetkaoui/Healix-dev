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
import { DashboardThemeControl } from "@/components/dashboard/layout/DashboardThemeControl";
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
    <header className="dashboard-chrome sticky top-0 z-30 border-b border-[var(--line)]">
      <div className="flex min-h-[92px] items-center gap-3 px-4 sm:px-6">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-11 w-11 rounded-2xl border-border bg-card shadow-sm lg:hidden"
          aria-label="Menu"
          onClick={onMenuClick}
        >
          <Menu className="h-4 w-4" aria-hidden="true" />
        </Button>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="hidden h-8 w-8 items-center justify-center rounded-xl border border-[var(--accent-line)] bg-secondary text-[var(--accent-dark)] sm:flex">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {breadcrumb}
              </p>
              <h1 className="mt-1 text-xl font-semibold tracking-tight text-foreground sm:truncate sm:text-2xl">
                {title}
              </h1>
            </div>
          </div>
        </div>

        <div className="hidden min-w-[200px] max-w-sm flex-1 2xl:block">
          <div className="relative">
            <Search
              className={cn(
                "absolute top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground",
                direction === "rtl" ? "right-4" : "left-4",
              )}
              aria-hidden="true"
            />
            <Input
              type="search"
              dir={direction}
              className={cn(
                "h-12 rounded-2xl border-border bg-card text-start shadow-sm shadow-slate-950/5 transition focus-visible:border-[var(--accent-line)] focus-visible:ring-ring",
                direction === "rtl" ? "pr-11 pl-20" : "pl-11 pr-20",
              )}
              placeholder={t("admin.header.searchPlaceholder")}
            />
            <span
              className={cn(
                "pointer-events-none absolute top-1/2 hidden -translate-y-1/2 items-center gap-1 rounded-lg border border-border bg-muted px-2 py-1 text-[11px] font-semibold text-muted-foreground xl:flex",
                direction === "rtl" ? "left-3" : "right-3",
              )}
            >
              <Command className="h-3 w-3" aria-hidden="true" />
              K
            </span>
          </div>
        </div>

        <div className="hidden items-center gap-2 2xl:flex">
          <div className="inline-flex items-center gap-2 rounded-lg border border-[var(--accent-line)] bg-[var(--accent-soft)] px-3 py-2 text-xs font-semibold text-[var(--accent-dark)]">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            {t("admin.header.secureSession")}
          </div>
          <div className="inline-flex items-center gap-2 rounded-2xl border border-border bg-card px-3 py-2 text-xs font-medium text-muted-foreground shadow-sm">
            <CalendarDays className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            {t("admin.header.today")}
          </div>
        </div>

        <div className="hidden lg:block">
          <LanguageSwitcher
            locale={locale}
            onLocaleChange={onLocaleChange}
            t={t}
            variant="compact"
          />
        </div>

        <div className="hidden sm:block"><DashboardThemeControl t={t} /></div>

        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={t("admin.header.notification")}
          className="relative h-11 w-11 rounded-2xl border-border bg-card shadow-sm"
        >
          <Bell className="h-4 w-4" aria-hidden="true" />
          <span
            className={cn(
              "absolute top-2 h-2.5 w-2.5 rounded-full border-2 border-card bg-primary",
              direction === "rtl" ? "left-2" : "right-2",
            )}
          />
        </Button>

        <div className="hidden items-center gap-3 rounded-2xl border border-border bg-card p-2 shadow-sm shadow-slate-950/5 md:flex">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-sm font-bold text-white shadow-sm">
            {initials}
          </span>
          <div className="min-w-0">
            <p className="max-w-[170px] truncate text-sm font-semibold text-foreground">
              {displayName}
            </p>
            <div className="mt-0.5 flex items-center gap-2">
              <p className="truncate text-xs font-semibold text-[var(--accent-dark)]">
                {displayRole}
              </p>
            </div>
          </div>
          <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        </div>
      </div>
      <div className="grid gap-3 border-t border-border px-4 py-3 lg:hidden">
        <div className="relative">
          <Search
            className={cn(
              "absolute top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground",
              direction === "rtl" ? "right-3" : "left-3",
            )}
            aria-hidden="true"
          />
          <Input
            type="search"
            dir={direction}
            className={cn(
              "h-11 rounded-2xl border-border bg-card text-start shadow-sm",
              direction === "rtl" ? "pr-10" : "pl-10",
            )}
            placeholder={t("admin.header.searchPlaceholder")}
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 lg:hidden">
          <LanguageSwitcher
            locale={locale}
            onLocaleChange={onLocaleChange}
            t={t}
            variant="compact"
          />
          <div className="sm:hidden"><DashboardThemeControl t={t} /></div>
        </div>
      </div>
    </header>
  );
}
