"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { type Locale } from "@/i18n";
import { type TranslationFunction } from "@/lib/i18n";
import { useRecentNotifications, useUnreadNotificationCount } from "../hooks/useNotifications";
import { NotificationItem } from "./NotificationItem";

export function NotificationBell({ account, locale, t }: { account: "establishment" | "doctor"; locale: Locale; t: TranslationFunction }) {
  const count = useUnreadNotificationCount().data?.count ?? 0;
  const recent = useRecentNotifications();
  return <details className="relative shrink-0"><summary className="clinical-icon-button relative" aria-label={t("notifications.title")} title={t("notifications.title")}><Bell size={18} strokeWidth={1.8} />{count > 0 ? <span className="absolute -end-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--medical)] px-1 text-[.6rem] font-bold text-white" aria-label={t("notifications.unreadCount", { count })}>{count > 99 ? "99+" : count}</span> : null}</summary><div className="clinical-popover w-[min(24rem,calc(100vw-2rem))] p-0"><div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3"><h2 className="text-sm font-semibold">{t("notifications.title")}</h2>{count ? <span className="text-xs text-[var(--medical)]">{t("notifications.unreadCount", { count })}</span> : null}</div><div className="max-h-[23rem] overflow-y-auto">{recent.isLoading ? <p className="p-4 clinical-caption">{t("notifications.loading")}</p> : recent.data?.data.length ? recent.data.data.map((item) => <NotificationItem key={item.id} notification={item} account={account} locale={locale} t={t} compact />) : <p className="p-5 text-center clinical-caption">{t("notifications.empty.all")}</p>}</div><Link href={`/${account}/notifications`} className="flex justify-center border-t border-[var(--line)] px-4 py-3 text-xs font-semibold text-[var(--medical)] hover:bg-[var(--panel-soft)]">{t("notifications.actions.viewAll")}</Link></div></details>;
}
