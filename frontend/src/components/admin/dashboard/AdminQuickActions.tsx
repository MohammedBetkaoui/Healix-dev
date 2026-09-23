import { FileClock, ShieldCheck, Users } from "lucide-react";
import Link from "next/link";

import { adminRoutes } from "@/config/admin-routes";
import { type TranslationFunction } from "@/lib/i18n";

type AdminQuickActionsProps = {
  t: TranslationFunction;
};

const quickActions = [
  {
    href: adminRoutes.verifications,
    icon: ShieldCheck,
    labelKey: "admin.dashboard.actions.verifications",
  },
  {
    href: adminRoutes.users,
    icon: Users,
    labelKey: "admin.dashboard.actions.users",
  },
  {
    href: adminRoutes.auditLogs,
    icon: FileClock,
    labelKey: "admin.dashboard.actions.audit",
  },
] as const;

export function AdminQuickActions({ t }: AdminQuickActionsProps) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-foreground">
        {t("admin.dashboard.quickActions")}
      </h2>
      <div className="mt-5 grid gap-3">
        {quickActions.map((action) => {
          const Icon = action.icon;

          return (
            <Link
              key={action.labelKey}
              href={action.href}
              className="flex items-center gap-3 rounded-xl border border-border bg-muted p-4 text-sm font-semibold text-foreground transition hover:border-[var(--accent-line)] hover:bg-secondary"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-card text-[var(--accent-dark)] shadow-sm">
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
              {t(action.labelKey)}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
