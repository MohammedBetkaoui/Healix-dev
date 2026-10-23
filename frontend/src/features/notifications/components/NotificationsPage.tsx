"use client";

import { Bell, CheckCheck, Filter, Settings2, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { DashboardShell } from "@/components/dashboard/layout/DashboardShell";
import { doctorNavSections, establishmentNavSections } from "@/components/dashboard/layout/navigation";
import { useCurrentUser } from "@/features/auth/hooks/use-current-user";
import { useEstablishmentVerificationPrefill } from "@/features/verification/hooks/use-establishment-verification-prefill";
import { getAccountInitials } from "@/lib/format/get-account-initials";
import { useStoredLocale, useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useNotificationActions, useNotifications } from "../hooks/useNotifications";
import { type NotificationCategory, type NotificationFilters, type NotificationReadStatus, type NotificationSeverity } from "../types/notification.types";
import { groupNotifications, type NotificationGroupKey } from "../utils/notification-groups";
import { NotificationItem } from "./NotificationItem";
import { NotificationPreferencesDrawer } from "./NotificationPreferencesDrawer";

const categories: NotificationCategory[] = ["APPOINTMENT", "PATIENT", "AI_ANALYSIS", "REPORT", "PRESCRIPTION", "MESSAGING", "VERIFICATION", "SUBSCRIPTION", "PAYMENT", "TEAM", "SECURITY", "SYSTEM"];
const severities: NotificationSeverity[] = ["INFO", "SUCCESS", "WARNING", "CRITICAL"];

export function NotificationsPage({ accountType }: { accountType: "ESTABLISHMENT" | "DOCTOR" }) {
  const { locale } = useStoredLocale();
  const { t } = useTranslation(locale);
  const [filters, setFilters] = useState<NotificationFilters>({ status: "ALL" });
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const query = useNotifications(filters);
  const actions = useNotificationActions();
  const currentUser = useCurrentUser(undefined, { enabled: true });
  const prefill = useEstablishmentVerificationPrefill({ enabled: accountType === "ESTABLISHMENT" });
  const account = accountType === "ESTABLISHMENT" ? "establishment" : "doctor";
  const items = query.data?.pages.flatMap((page) => page.data) ?? [];
  const groups = groupNotifications(items);
  const total = query.data?.pages[0]?.meta.total ?? 0;
  const tabs: { label: string; status: NotificationReadStatus; category?: NotificationCategory }[] = [
    { label: t("notifications.tabs.all"), status: "ALL" },
    { label: t("notifications.tabs.unread"), status: "UNREAD" },
    { label: t("notifications.tabs.clinical"), status: "ALL", category: "APPOINTMENT" },
    { label: t("notifications.tabs.ai"), status: "ALL", category: "AI_ANALYSIS" },
    { label: t("notifications.tabs.admin"), status: "ALL", category: "VERIFICATION" },
  ];
  const initials = getAccountInitials(currentUser.data?.fullName);
  const shellProps = accountType === "ESTABLISHMENT" ? {
    accountType: "ESTABLISHMENT" as const, navSections: establishmentNavSections,
    user: { accountType: "ESTABLISHMENT" as const, footerSubtitle: t("dashboard.clinical.administration"), initials, name: currentUser.data?.fullName || t("dashboard.clinical.administration"), roleKey: "dashboard.common.roles.establishment", workspaceSubtitle: prefill.data?.establishment.name || t("dashboard.clinical.workspace") },
  } : {
    accountType: "INDEPENDENT_DOCTOR" as const, navSections: doctorNavSections,
    user: { accountType: "INDEPENDENT_DOCTOR" as const, footerSubtitle: t("dashboard.clinical.doctor.practice"), initials, name: currentUser.data?.fullName || t("dashboard.clinical.doctor.workspace"), roleKey: "dashboard.common.roles.doctor", workspaceSubtitle: t("dashboard.clinical.doctor.workspace") },
  };
  const groupOrder: NotificationGroupKey[] = ["today", "yesterday", "week", "older"];
  return <DashboardShell {...shellProps} activeKey="notifications" breadcrumbLabel={t("notifications.breadcrumb")} titleKey="notifications.title">
    <div className="mx-auto w-full max-w-5xl pb-12">
      <header className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div><p className="mb-1 text-xs font-medium text-[var(--medical)]">{t("notifications.breadcrumb")}</p><h1 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">{t("notifications.title")}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">{t("notifications.subtitle")}</p></div>
        <div className="flex flex-wrap gap-2"><button type="button" className="clinical-button clinical-button-secondary" onClick={() => setPreferencesOpen(true)}><Settings2 size={16} />{t("notifications.actions.preferences")}</button><button type="button" className="clinical-button clinical-button-primary" disabled={!items.some((item) => !item.readAt) || actions.readAll.isPending} onClick={() => actions.readAll.mutate(filters.category)}><CheckCheck size={16} />{t("notifications.actions.readAll")}</button></div>
      </header>
      <div className="mb-5 flex gap-2 rounded-lg border border-[var(--accent-line)] bg-[var(--medical-soft)] p-3 text-xs leading-5 text-[var(--text-secondary)]"><ShieldCheck size={17} className="mt-0.5 shrink-0 text-[var(--medical)]" /><p>{t("notifications.confidentiality")}</p></div>
      <section className="surface-section overflow-hidden">
        <div className="border-b border-[var(--line)] px-3 pt-3 sm:px-4"><div className="flex gap-1 overflow-x-auto pb-3" role="tablist">{tabs.map((tab) => { const active = filters.status === tab.status && filters.category === tab.category; return <button key={tab.label} type="button" role="tab" aria-selected={active} onClick={() => setFilters({ status: tab.status, category: tab.category })} className={cn("shrink-0 rounded-lg px-3 py-2 text-xs font-medium transition-colors", active ? "bg-[var(--medical)] text-white" : "text-[var(--text-secondary)] hover:bg-[var(--panel-soft)]")}>{tab.label}</button>; })}</div></div>
        <div className="flex flex-col gap-3 border-b border-[var(--line)] bg-[var(--panel-soft)]/45 p-3 sm:flex-row sm:items-center sm:px-4"><div className="flex items-center gap-2 text-xs font-medium text-[var(--text-secondary)]"><Filter size={14} />{t("notifications.filters.title")}</div><select aria-label={t("notifications.filters.category")} value={filters.category ?? ""} onChange={(event) => setFilters((current) => ({ ...current, category: (event.target.value || undefined) as NotificationCategory | undefined }))} className="clinical-input h-9 min-w-44 text-xs"><option value="">{t("notifications.filters.allCategories")}</option>{categories.map((category) => <option key={category} value={category}>{t(`notifications.categories.${category}`)}</option>)}</select><select aria-label={t("notifications.filters.severity")} value={filters.severity ?? ""} onChange={(event) => setFilters((current) => ({ ...current, severity: (event.target.value || undefined) as NotificationSeverity | undefined }))} className="clinical-input h-9 min-w-40 text-xs"><option value="">{t("notifications.filters.allSeverities")}</option>{severities.map((severity) => <option key={severity} value={severity}>{t(`notifications.severities.${severity}`)}</option>)}</select><span className="sm:ms-auto text-xs text-[var(--ink-faint)]">{t("notifications.count", { count: total })}</span></div>
        {query.isLoading ? <div className="space-y-3 p-5" aria-label={t("notifications.loading")}>{[1,2,3,4].map((item) => <div key={item} className="h-20 animate-pulse rounded-lg bg-[var(--panel-soft)]" />)}</div> : query.isError ? <div className="flex min-h-56 flex-col items-center justify-center p-6 text-center"><Bell size={28} className="mb-3 text-[var(--ink-faint)]" /><p className="text-sm font-medium">{t("notifications.error")}</p><button type="button" className="clinical-button clinical-button-secondary mt-4" onClick={() => query.refetch()}>{t("notifications.actions.retry")}</button></div> : items.length === 0 ? <div className="flex min-h-56 flex-col items-center justify-center p-6 text-center"><span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--medical-soft)] text-[var(--medical)]"><CheckCheck size={22} /></span><p className="text-sm font-medium">{filters.status === "UNREAD" ? t("notifications.empty.unread") : t("notifications.empty.all")}</p></div> : <div>{groupOrder.map((group) => { const grouped = groups.get(group); return grouped?.length ? <section key={group} aria-labelledby={`notifications-${group}`}><h2 id={`notifications-${group}`} className="border-b border-[var(--line)] bg-[var(--panel-soft)] px-4 py-2 text-[.68rem] font-semibold uppercase tracking-wide text-[var(--ink-faint)] sm:px-5">{t(`notifications.groups.${group}`)}</h2>{grouped.map((notification) => <NotificationItem key={notification.id} notification={notification} account={account} locale={locale} t={t} />)}</section> : null; })}{query.hasNextPage ? <div className="flex justify-center border-t border-[var(--line)] p-4"><button type="button" className="clinical-button clinical-button-secondary" disabled={query.isFetchingNextPage} onClick={() => query.fetchNextPage()}>{query.isFetchingNextPage ? t("notifications.loading") : t("notifications.actions.loadMore")}</button></div> : null}</div>}
      </section>
    </div><NotificationPreferencesDrawer open={preferencesOpen} onClose={() => setPreferencesOpen(false)} t={t} />
  </DashboardShell>;
}
