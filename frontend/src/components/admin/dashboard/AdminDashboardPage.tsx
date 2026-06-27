"use client";

import {
  Activity,
  ClipboardCheck,
  FileCheck2,
  Loader2,
  LogOut,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { LanguageSwitcher } from "@/components/shared/LanguageSwitcher";
import { Button } from "@/components/ui/button";
import { adminRoutes } from "@/config/admin-routes";
import { useAdminCurrentUser } from "@/features/admin-auth/hooks/use-admin-current-user";
import { useAdminLogout } from "@/features/admin-auth/hooks/use-admin-logout";
import { useStoredLocale, useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const dashboardCards = [
  {
    icon: ClipboardCheck,
    labelKey: "adminAuth.dashboard.cards.verificationRequests.label",
    valueKey: "adminAuth.dashboard.cards.verificationRequests.value",
  },
  {
    icon: UsersRound,
    labelKey: "adminAuth.dashboard.cards.pendingAccounts.label",
    valueKey: "adminAuth.dashboard.cards.pendingAccounts.value",
  },
  {
    icon: Activity,
    labelKey: "adminAuth.dashboard.cards.auditLogs.label",
    valueKey: "adminAuth.dashboard.cards.auditLogs.value",
  },
] as const;

export function AdminDashboardPage() {
  const router = useRouter();
  const { locale, setLocale } = useStoredLocale();
  const { direction, t } = useTranslation(locale);
  const { data: admin, error, isLoading } = useAdminCurrentUser();
  const logoutMutation = useAdminLogout();

  useEffect(() => {
    if (error) {
      router.replace(adminRoutes.login);
    }
  }, [error, router]);

  if (isLoading) {
    return (
      <main
        dir={direction}
        className="flex min-h-screen items-center justify-center bg-slate-50 px-6"
      >
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm text-slate-700 shadow-sm">
          <Loader2 className="h-4 w-4 animate-spin text-cyan-700" />
          <span>{t("adminAuth.dashboard.loading")}</span>
        </div>
      </main>
    );
  }

  if (!admin) {
    return (
      <main
        dir={direction}
        className="flex min-h-screen items-center justify-center bg-slate-50 px-6"
      >
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-700 shadow-sm">
          {t("adminAuth.dashboard.restricted")}
        </div>
      </main>
    );
  }

  return (
    <main
      dir={direction}
      className={cn(
        "min-h-screen bg-slate-50 px-4 py-5 text-slate-950 sm:px-6 lg:px-8",
        direction === "rtl" ? "text-right" : "text-left",
      )}
    >
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-col gap-4 rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#061f35] text-cyan-200">
              <ShieldCheck className="h-6 w-6" aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm text-slate-500">{admin.email}</p>
              <h1 className="text-2xl font-semibold tracking-tight">
                {t("adminAuth.dashboard.title")}
              </h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <LanguageSwitcher
              locale={locale}
              onLocaleChange={setLocale}
              t={t}
            />
            <Button
              type="button"
              variant="outline"
              disabled={logoutMutation.isPending}
              onClick={() => logoutMutation.mutate()}
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              {t("adminAuth.dashboard.actions.logout")}
            </Button>
          </div>
        </header>

        <section className="mt-6 rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <span className="inline-flex rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-800">
                {admin.role}
              </span>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-600">
                {t("adminAuth.dashboard.subtitle")}
              </p>
            </div>
            <Link
              href={adminRoutes.verifications}
              className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-[#0b3b5f] px-4 py-2 text-sm font-medium text-white shadow-sm shadow-sky-950/15 transition-colors hover:bg-[#092f4d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2"
            >
              <FileCheck2 className="h-4 w-4" aria-hidden="true" />
              {t("adminAuth.dashboard.actions.verifications")}
            </Link>
          </div>
        </section>

        <section className="mt-6 grid gap-4 md:grid-cols-3">
          {dashboardCards.map((card) => {
            const Icon = card.icon;

            return (
              <div
                key={card.labelKey}
                className="rounded-[1.5rem] border border-slate-200 bg-white p-6 shadow-sm"
              >
                <div className="flex items-center justify-between gap-4">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-50 text-[#061f35] ring-1 ring-slate-200">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className="text-3xl font-semibold tracking-tight">
                    {t(card.valueKey)}
                  </span>
                </div>
                <p className="mt-5 text-sm font-medium text-slate-600">
                  {t(card.labelKey)}
                </p>
              </div>
            );
          })}
        </section>
      </div>
    </main>
  );
}
