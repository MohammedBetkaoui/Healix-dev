"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { LanguageSwitcher } from "@/components/shared/LanguageSwitcher";
import { adminRoutes } from "@/config/admin-routes";
import { useAdminCurrentUser } from "@/features/admin-auth/hooks/use-admin-current-user";
import { useStoredLocale, useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";

import { AdminLoginForm } from "./AdminLoginForm";
import { AdminLoginHeroPanel } from "./AdminLoginHeroPanel";

export function AdminLoginPage() {
  const router = useRouter();
  const { locale, setLocale } = useStoredLocale();
  const { direction, t } = useTranslation(locale);
  const { data: admin } = useAdminCurrentUser();

  useEffect(() => {
    if (admin) {
      router.replace(adminRoutes.dashboard);
    }
  }, [admin, router]);

  return (
    <main
      dir={direction}
      className={cn(
        "min-h-screen bg-[linear-gradient(135deg,#f8fafc_0%,#eef6f8_45%,#f8fafc_100%)] px-4 py-6 text-slate-950 sm:px-6 lg:px-8",
        direction === "rtl" ? "text-right" : "text-left",
      )}
    >
      <div className="mx-auto flex w-full max-w-7xl justify-end">
        <LanguageSwitcher locale={locale} onLocaleChange={setLocale} t={t} />
      </div>
      <div className="mx-auto mt-6 grid w-full max-w-7xl gap-6 lg:grid-cols-[1.08fr_0.92fr]">
        <AdminLoginHeroPanel direction={direction} t={t} />
        <section className="rounded-[2rem] border border-slate-200 bg-white/90 p-6 shadow-2xl shadow-slate-950/10 backdrop-blur sm:p-8 lg:p-10">
          <AdminLoginForm direction={direction} t={t} />
        </section>
      </div>
    </main>
  );
}
