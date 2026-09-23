"use client";

import {
  FileClock,
  LayoutDashboard,
  LogOut,
  Settings,
  ShieldCheck,
  Users,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";
import { adminRoutes } from "@/config/admin-routes";
import { useAdminLogout } from "@/features/admin-auth/hooks/use-admin-logout";
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
    href: adminRoutes.patients,
    icon: UsersRound,
    key: "patients",
    labelKey: "admin.layout.nav.patients",
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
  const adminLogoutMutation = useAdminLogout();
  const displayName = adminName ?? "HealixDZ Admin";

  const handleLogout = () => {
    onNavigate?.();
    adminLogoutMutation.mutate();
  };

  return (
    <aside className="dashboard-chrome flex h-full w-full lg:w-[280px] flex-col border-[var(--line)]">
      <div className="border-b border-border p-5">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-white shadow-sm">
            <ShieldCheck className="h-6 w-6" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="truncate text-base font-semibold text-foreground">
                HealixDZ
              </p>
              <span className="rounded-md border border-[var(--accent-line)] bg-secondary px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--accent-dark)]">
                {t("admin.layout.adminBadge")}
              </span>
            </div>
            <p className="mt-1 truncate text-xs text-muted-foreground">
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
                className="flex h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-muted-foreground"
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
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "group relative flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-white shadow-sm shadow-slate-950/10"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              <span className="flex-1 text-start">{t(item.labelKey)}</span>
              {isActive ? (
                <span
                  className={cn(
                    "absolute top-1/2 h-5 w-1 -translate-y-1/2 rounded-full bg-primary",
                    direction === "rtl" ? "-right-1" : "-left-1",
                  )}
                />
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border p-4">
        <div className="rounded-2xl border border-[var(--accent-line)] bg-secondary/70 p-4">
          <p className="text-sm font-semibold text-[var(--accent-dark)]">
            {t("admin.layout.secureAccess")}
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {t("admin.layout.secureAccessDescription")}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          disabled={adminLogoutMutation.isPending}
          className="mt-3 w-full justify-start text-muted-foreground"
          onClick={handleLogout}
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          {t("admin.layout.nav.logout")}
        </Button>
      </div>
    </aside>
  );
}
