"use client";

import {
  Activity,
  PanelLeftClose,
  PanelLeftOpen,
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
  isCollapsed: boolean;
  isOpen: boolean;
  navSections: DashboardNavSection[];
  onClose: () => void;
  onToggleCollapse: () => void;
  t: TranslationFunction;
  user: DashboardUserSummary;
};

function badgeClasses(tone: DashboardNavBadgeTone) {
  if (tone === "red") {
    return "border border-[var(--danger-line)] bg-[var(--danger-soft)] text-[var(--danger-ink)]";
  }

  if (tone === "purple") {
    return "border border-[var(--accent-line)] bg-[var(--accent-soft)] text-[var(--accent-dark)]";
  }

  return "border border-[var(--accent-line)] bg-[var(--accent-soft)] text-[var(--accent-dark)]";
}

type NavRowProps = {
  active: boolean;
  direction: Direction;
  isCollapsed: boolean;
  isLogoutLoading: boolean;
  item: DashboardNavItem;
  onLogout: () => void;
  t: TranslationFunction;
};

function NavRow({
  active,
  direction,
  isCollapsed,
  isLogoutLoading,
  item,
  onLogout,
  t,
}: NavRowProps) {
  const Icon = item.icon;
  const label = isLogoutLoading && item.key === "logout"
    ? `${t(item.labelKey)}...`
    : t(item.labelKey);
  const rowClasses = cn(
    "group relative flex min-h-11 w-full items-center gap-3 rounded-[0.78rem] border border-transparent px-3 text-sm font-medium transition",
    isCollapsed && "lg:justify-center lg:gap-0 lg:px-0",
    active
      ? "border-primary bg-primary text-primary-foreground shadow-sm"
      : "text-[var(--ink-soft)] hover:bg-[var(--panel-soft)] hover:text-[var(--ink)]",
  );
  const rowContent = (
    <>
      {active ? (
        <span
          className={cn(
            "absolute top-1/2 h-4 -translate-y-1/2 rounded-full bg-[var(--accent)] shadow-sm",
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
          active
            ? "text-primary-foreground"
            : "text-[var(--ink-faint)] group-hover:text-[var(--ink)]",
        )}
      />
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-start",
          isCollapsed && "lg:hidden",
        )}
      >
        {label}
      </span>
      {item.badge ? (
        <span
          className={cn(
            "inline-flex min-w-7 items-center justify-center rounded-md px-1.5 py-0.5 text-[10px] font-bold tracking-[0.08em]",
            isCollapsed && "lg:hidden",
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
        title={label}
        aria-label={label}
      >
        {rowContent}
      </button>
    );
  }

  return (
    <Link href={item.href} className={rowClasses} title={label} aria-label={label} aria-current={active ? "page" : undefined}>
      {rowContent}
    </Link>
  );
}

export function DashboardSidebar({
  activeKey,
  direction,
  isCollapsed,
  isOpen,
  navSections,
  onClose,
  onToggleCollapse,
  t,
  user,
}: DashboardSidebarProps) {
  const { isLoading: isLogoutLoading, logout } = useLogout();
  const CollapseIcon = isCollapsed ? PanelLeftOpen : PanelLeftClose;

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-30 bg-[#0f172a]/30 transition lg:hidden",
          isOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        className={cn(
          "dashboard-chrome fixed inset-y-0 z-40 flex w-[272px] shrink-0 flex-col shadow-xl transition-[transform,width] duration-300 lg:sticky lg:inset-auto lg:top-0 lg:z-0 lg:h-screen lg:translate-x-0 lg:self-start lg:shadow-none",
          isCollapsed ? "lg:w-[88px]" : "lg:w-[272px]",
          direction === "rtl"
            ? "right-0 border-l border-[var(--line)] lg:right-auto"
            : "left-0 border-r border-[var(--line)] lg:left-auto",
          isOpen
            ? "translate-x-0"
            : direction === "rtl"
              ? "translate-x-full"
              : "-translate-x-full",
        )}
      >
        <div className="border-b border-[var(--line)] px-4 py-4">
          <div
            className={cn(
              "flex items-start justify-between gap-3",
              isCollapsed && "lg:flex-col lg:items-center lg:justify-start lg:gap-2",
            )}
          >
            <div
              className={cn(
                "flex min-w-0 items-center gap-3",
                isCollapsed && "lg:justify-center lg:gap-0",
              )}
            >
              <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-[0.92rem] bg-primary text-white shadow-sm ">
                <Activity size={19} strokeWidth={2} />
              </span>
              <div className={cn("min-w-0", isCollapsed && "lg:hidden")}>
                <div className="flex items-center gap-2">
                  <p className="truncate font-[var(--font-auth-mono)] text-[1.02rem] font-medium tracking-[0.01em] text-[var(--ink)]">
                    Healix<span className="text-[var(--accent)]">Dz</span>
                  </p>
                  <span className="rounded-[0.35rem] border border-[var(--accent-line)] bg-[var(--accent-soft)] px-1.5 py-0.5 font-[var(--font-auth-mono)] text-[9px] font-medium tracking-[0.08em] text-[var(--accent-dark)]">
                    PRO
                  </span>
                </div>
                <p className="truncate text-xs text-[var(--ink-faint)]">
                  {user.workspaceSubtitle}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="icon"
              className="hidden h-9 w-9 rounded-[0.72rem] border-[var(--line)] bg-[var(--panel)] text-[var(--ink-soft)] transition hover:bg-[var(--accent-soft)] hover:text-[var(--accent-dark)] lg:inline-flex"
              onClick={onToggleCollapse}
              aria-label={
                isCollapsed
                  ? t("dashboard.sidebar.expand")
                  : t("dashboard.sidebar.collapse")
              }
              title={
                isCollapsed
                  ? t("dashboard.sidebar.expand")
                  : t("dashboard.sidebar.collapse")
              }
            >
              <CollapseIcon
                className={cn("h-4 w-4", direction === "rtl" && "rotate-180")}
                strokeWidth={1.8}
              />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full text-[var(--ink-soft)] lg:hidden"
              onClick={onClose}
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div
          className={cn(
            "dashboard-sidebar-scroll flex-1 overflow-y-auto px-4 py-5",
            isCollapsed && "lg:px-3",
          )}
        >
          {navSections.map((section) => (
            <section
              key={section.key}
              className={cn("mb-6 last:mb-0", isCollapsed && "lg:mb-3")}
            >
              <p
                className={cn(
                  "px-3 pb-2 font-[var(--font-auth-mono)] text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--ink-faint)]",
                  isCollapsed && "lg:sr-only",
                )}
              >
                {t(section.titleKey)}
              </p>
              <div className="space-y-0.5">
                {section.items.map((item) => (
                  <NavRow
                    key={item.key}
                    active={item.key === activeKey}
                    direction={direction}
                    isCollapsed={isCollapsed}
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

        <div className="mt-auto border-t border-[var(--line)] px-4 py-3">
          <div
            className={cn(
              "flex items-center gap-3",
              isCollapsed && "lg:justify-center lg:gap-0",
            )}
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[0.78rem] border border-[var(--accent-deep)] bg-primary text-sm font-semibold text-primary-foreground shadow-sm">
              {user.initials}
            </span>
            <div className={cn("min-w-0 flex-1", isCollapsed && "lg:hidden")}>
              <p className="truncate text-sm font-medium text-[var(--ink)]">
                {user.name}
              </p>
              <div className="flex items-center gap-1.5">
                <p className="truncate text-xs text-[var(--ink-soft)]">
                  {user.footerSubtitle}
                </p>
              </div>
            </div>
            <button
              type="button"
              className={cn(
                "inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--ink-faint)] transition hover:bg-[var(--accent-soft)] hover:text-[var(--accent-dark)]",
                isCollapsed && "lg:hidden",
              )}
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
