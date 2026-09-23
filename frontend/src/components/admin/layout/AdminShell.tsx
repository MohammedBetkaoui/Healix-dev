"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";

import { adminRoutes } from "@/config/admin-routes";
import { useAdminCurrentUser } from "@/features/admin-auth/hooks/use-admin-current-user";
import { useStoredLocale, useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";

import { AdminContent } from "./AdminContent";
import { AdminHeader } from "./AdminHeader";
import { AdminMobileSidebar } from "./AdminMobileSidebar";
import { AdminSidebar } from "./AdminSidebar";

type AdminShellProps = {
  breadcrumb: string;
  children: ReactNode;
  titleKey: string;
};

export function AdminShell({ breadcrumb, children, titleKey }: AdminShellProps) {
  const router = useRouter();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const { locale, setLocale } = useStoredLocale();
  const { direction, t } = useTranslation(locale);
  const {
    data: admin,
    error: adminSessionError,
    isLoading: adminSessionLoading,
  } = useAdminCurrentUser();

  // Frontend route obfuscation is not security. Backend role checks remain mandatory.
  // Admin data is loaded from secure backend endpoints using httpOnly admin cookies.

  useEffect(() => {
    if (adminSessionError) {
      router.replace(adminRoutes.login);
    }
  }, [adminSessionError, router]);

  if (adminSessionLoading) {
    return (
      <div
        lang={locale}
        dir={direction}
        className="dashboard-theme flex min-h-screen items-center justify-center px-6"
      >
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-5 py-4 text-sm text-muted-foreground shadow-sm">
          <Loader2 className="h-4 w-4 animate-spin text-[var(--accent-dark)]" />
          {t("adminAuth.dashboard.loading")}
        </div>
      </div>
    );
  }

  return (
    <div
      lang={locale}
      dir={direction}
      className={cn(
        "dashboard-theme min-h-screen",
        direction === "rtl" ? "text-right" : "text-left",
      )}
    >
      <div
        className={cn(
          "fixed top-0 z-40 hidden h-screen lg:block",
          direction === "rtl"
            ? "right-0 border-l border-border"
            : "left-0 border-r border-border",
        )}
      >
        <AdminSidebar adminName={admin?.fullName} direction={direction} t={t} />
      </div>

      <AdminMobileSidebar
        adminName={admin?.fullName}
        direction={direction}
        isOpen={mobileSidebarOpen}
        onClose={() => setMobileSidebarOpen(false)}
        t={t}
      />

      <div
        className={cn(
          "min-h-screen",
          direction === "rtl" ? "lg:pr-[280px]" : "lg:pl-[280px]",
        )}
      >
        <AdminHeader
          adminEmail={admin?.email}
          adminName={admin?.fullName}
          adminRole={admin?.role}
          breadcrumb={breadcrumb}
          direction={direction}
          locale={locale}
          onLocaleChange={setLocale}
          onMenuClick={() => setMobileSidebarOpen(true)}
          t={t}
          title={t(titleKey)}
        />
        <AdminContent>{children}</AdminContent>
      </div>
    </div>
  );
}
