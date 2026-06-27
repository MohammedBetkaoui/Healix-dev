"use client";

import {
  FileClock,
  LayoutDashboard,
  LogOut,
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";
import { adminRoutes } from "@/config/admin-routes";
import { type Direction, type TranslationFunction } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { type AdminNavItem } from "@/types/admin";

type AdminSidebarProps = {
  adminName?: string;
  direction: Direction;
  onNavigate?: () => void;
  t: TranslationFunction;
};

const navItems: AdminNavItem[] = [
  {
    href: adminRoutes.dashboard,
    icon: LayoutDashboard,
    key: "dashboard",
    labelKey: "admin.layout.nav.dashboard",
  },
  {
    href: adminRoutes.verifications,
    icon: ShieldCheck,
    key: "verifications",
    labelKey: "admin.layout.nav.verifications",
  },
  {
    href: adminRoutes.users,
    icon: Users,
    key: "users",
    labelKey: "admin.layout.nav.users",
  },
  {
    href: adminRoutes.auditLogs,
    icon: FileClock,
    key: "auditLogs",
    labelKey: "admin.layout.nav.auditLogs",
  },
  {
    disabled: true,
    href: adminRoutes.settings,
    icon: Settings,
    key: "settings",
    labelKey: "admin.layout.nav.settings",
  },
];

function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminSidebar({
  adminName,
  direction,
  onNavigate,
  t,
}: AdminSidebarProps) {
  const pathname = usePathname();
  const displayName = adminName ?? "HealixDZ Admin";

  return (
    <aside className="flex h-full w-[280px] flex-col border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 p-5">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#0b3b5f] text-white shadow-sm">
            <ShieldCheck className="h-6 w-6" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="truncate text-base font-semibold text-slate-950">
                {t("admin.layout.brand")}
              </p>
              <span className="rounded-md border border-cyan-200 bg-cyan-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-cyan-700">
                {t("admin.layout.adminBadge")}
              </span>
            </div>
            <p className="mt-1 truncate text-xs text-slate-500">
              {displayName}
            </p>
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-4" aria-label="Admin">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = !item.disabled && isActivePath(pathname, item.href);

          if (item.disabled) {
            return (
              <button
                key={item.key}
                type="button"
                disabled
                className="flex h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-slate-400"
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                <span className="flex-1 text-start">{t(item.labelKey)}</span>
              </button>
            );
          }

          return (
            <Link
              key={item.key}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "group relative flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors",
                isActive
                  ? "bg-[#0b3b5f] text-white shadow-sm shadow-slate-950/10"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-950",
              )}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              <span className="flex-1 text-start">{t(item.labelKey)}</span>
              {isActive ? (
                <span
                  className={cn(
                    "absolute top-1/2 h-5 w-1 -translate-y-1/2 rounded-full bg-cyan-300",
                    direction === "rtl" ? "-right-1" : "-left-1",
                  )}
                />
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-slate-200 p-4">
        <div className="rounded-2xl border border-cyan-100 bg-cyan-50/70 p-4">
          <p className="text-sm font-semibold text-[#0b3b5f]">
            {t("admin.layout.secureAccess")}
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            {t("admin.layout.secureAccessDescription")}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          className="mt-3 w-full justify-start text-slate-600"
          onClick={onNavigate}
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          {t("admin.layout.nav.logout")}
        </Button>
      </div>
    </aside>
  );
}
