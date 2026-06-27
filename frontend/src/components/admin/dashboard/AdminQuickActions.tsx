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
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-950">
        {t("admin.dashboard.quickActions")}
      </h2>
      <div className="mt-5 grid gap-3">
        {quickActions.map((action) => {
          const Icon = action.icon;

          return (
            <Link
              key={action.labelKey}
              href={action.href}
              className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-800 transition hover:border-cyan-200 hover:bg-cyan-50"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-[#0b3b5f] shadow-sm">
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
