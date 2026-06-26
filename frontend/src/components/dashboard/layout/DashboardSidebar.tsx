"use client";

import {
  Activity,
  Settings,
  X,
} from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { useLogout } from "@/features/auth/hooks/use-logout";
import { type Direction, type TranslationFunction } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  type DashboardNavBadgeTone,
  type DashboardNavItem,
  type DashboardNavSection,
  type DashboardUserSummary,
} from "@/types/dashboard";

type DashboardSidebarProps = {
  activeKey: string;
  direction: Direction;
  isOpen: boolean;
  navSections: DashboardNavSection[];
  onClose: () => void;
  t: TranslationFunction;
  user: DashboardUserSummary;
};

function badgeClasses(tone: DashboardNavBadgeTone) {
  if (tone === "red") {
    return "border border-red-200 bg-red-50 text-red-500";
  }

  if (tone === "purple") {
    return "border border-violet-200 bg-violet-50 text-violet-500";
  }

  return "border border-blue-200 bg-blue-50 text-blue-500";
}

type NavRowProps = {
  active: boolean;
  direction: Direction;
  isLogoutLoading: boolean;
  item: DashboardNavItem;
  onLogout: () => void;
  t: TranslationFunction;
};

function NavRow({
  active,
  direction,
  isLogoutLoading,
  item,
  onLogout,
  t,
}: NavRowProps) {
  const Icon = item.icon;
  const rowClasses = cn(
    "group relative flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium transition",
    active
      ? "bg-blue-50 text-blue-500"
      : "text-slate-700 hover:bg-slate-50 hover:text-slate-950",
  );
  const rowContent = (
    <>
      {active ? (
        <span
          className={cn(
            "absolute top-1/2 h-4 -translate-y-1/2 rounded-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.35)]",
            direction === "rtl" ? "right-0 w-0.5" : "left-0 w-0.5",
          )}
          aria-hidden="true"
        />
      ) : null}
      <Icon
        size={16}
        strokeWidth={1.7}
        className={cn(
          "shrink-0 transition",
          active ? "text-blue-500" : "text-slate-500 group-hover:text-slate-900",
        )}
      />
      <span className="min-w-0 flex-1 truncate text-start">
        {isLogoutLoading && item.key === "logout"
          ? `${t(item.labelKey)}...`
          : t(item.labelKey)}
      </span>
      {item.badge ? (
        <span
          className={cn(
            "inline-flex min-w-7 items-center justify-center rounded-md px-1.5 py-0.5 text-[10px] font-bold tracking-[0.08em]",
            badgeClasses(item.badge.tone),
          )}
        >
          {item.badge.text}
        </span>
      ) : null}
    </>
  );

  if (item.key === "logout") {
    return (
      <button
        type="button"
        className={rowClasses}
        disabled={isLogoutLoading}
        onClick={onLogout}
      >
        {rowContent}
      </button>
    );
  }

  return (
    <Link href={item.href} className={rowClasses}>
      {rowContent}
    </Link>
  );
}

export function DashboardSidebar({
  activeKey,
  direction,
  isOpen,
  navSections,
  onClose,
  t,
  user,
}: DashboardSidebarProps) {
  const { isLoading: isLogoutLoading, logout } = useLogout();

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-30 bg-slate-950/24 transition lg:hidden",
          isOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        className={cn(
          "fixed inset-y-0 z-40 flex w-[272px] shrink-0 flex-col bg-white shadow-[0_24px_80px_rgba(15,23,42,0.14)] transition lg:sticky lg:inset-auto lg:top-0 lg:z-0 lg:h-screen lg:translate-x-0 lg:self-start lg:shadow-none",
          direction === "rtl"
            ? "right-0 border-l border-slate-200/70 lg:right-auto"
            : "left-0 border-r border-slate-200/70 lg:left-auto",
          isOpen
            ? "translate-x-0"
            : direction === "rtl"
              ? "translate-x-full"
              : "-translate-x-full",
        )}
      >
        <div className="border-b border-slate-200/70 px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[linear-gradient(135deg,#3b82f6_0%,#7c3aed_100%)] text-white shadow-[0_12px_30px_rgba(59,130,246,0.28)]">
                <Activity size={18} strokeWidth={2.4} />
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="truncate text-[1.05rem] font-semibold tracking-tight text-slate-950">
                    HealixDZ
                  </p>
                  <span className="rounded-md border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold tracking-[0.08em] text-blue-500">
                    PRO
                  </span>
                </div>
                <p className="truncate text-xs text-slate-400">
                  {user.workspaceSubtitle}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full lg:hidden"
              onClick={onClose}
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-5">
          {navSections.map((section) => (
            <section key={section.key} className="mb-6 last:mb-0">
              <p className="px-3 pb-2 text-[10px] font-bold tracking-[0.18em] text-slate-400">
                {t(section.titleKey)}
              </p>
              <div className="space-y-0.5">
                {section.items.map((item) => (
                  <NavRow
                    key={item.key}
                    active={item.key === activeKey}
                    direction={direction}
                    isLogoutLoading={isLogoutLoading}
                    item={item}
                    onLogout={() => {
                      void logout();
                    }}
                    t={t}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-auto border-t border-slate-200/70 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,#10b981_0%,#3b82f6_100%)] text-sm font-semibold text-white shadow-[0_10px_24px_rgba(16,185,129,0.18)]">
              {user.initials}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-950">
                {user.name}
              </p>
              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.7)]" />
                <p className="truncate text-xs text-slate-500">
                  {user.footerSubtitle}
                </p>
              </div>
            </div>
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              aria-label={t("dashboard.sidebar.establishment.settings")}
            >
              <Settings size={16} strokeWidth={1.7} />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
