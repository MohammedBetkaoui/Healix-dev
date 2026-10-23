"use client";

import { Archive, BadgeCheck, Bell, BrainCircuit, CalendarDays, Check, ChevronRight, CreditCard, FileCheck2, RotateCcw, ShieldCheck, Stethoscope, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type KeyboardEvent, type MouseEvent } from "react";
import { type Locale } from "@/i18n";
import { type TranslationFunction } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useNotificationActions } from "../hooks/useNotifications";
import { type ClinicalNotification, type NotificationCategory } from "../types/notification.types";
import { getNotificationCopy } from "../utils/notification-copy";
import { resolveNotificationDestination } from "../utils/notification-routing";

const icons: Record<NotificationCategory, typeof Bell> = {
  APPOINTMENT: CalendarDays, PATIENT: Stethoscope, AI_ANALYSIS: BrainCircuit,
  REPORT: FileCheck2, PRESCRIPTION: FileCheck2, MESSAGING: Bell,
  VERIFICATION: BadgeCheck, SUBSCRIPTION: CreditCard, PAYMENT: CreditCard,
  TEAM: Users, SECURITY: ShieldCheck, SYSTEM: Bell,
};

export function NotificationItem({ notification, account, locale, t, compact = false }: { notification: ClinicalNotification; account: "establishment" | "doctor"; locale: Locale; t: TranslationFunction; compact?: boolean }) {
  const router = useRouter();
  const actions = useNotificationActions();
  const Icon = icons[notification.category];
  const copy = getNotificationCopy(notification, t, locale);
  const destination = resolveNotificationDestination(notification, account);
  const unread = !notification.readAt;
  const [renderedAt] = useState(Date.now);
  const relative = new Intl.RelativeTimeFormat(locale === "ar" ? "ar-DZ" : "fr-DZ", { numeric: "auto" });
  const minutes = Math.round((new Date(notification.createdAt).getTime() - renderedAt) / 60_000);
  const time = Math.abs(minutes) < 60 ? relative.format(minutes, "minute") : new Intl.DateTimeFormat(locale === "ar" ? "ar-DZ" : "fr-DZ", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(notification.createdAt));
  const open = async () => {
    if (unread) await actions.read.mutateAsync(notification.id).catch(() => undefined);
    if (destination) router.push(destination);
  };
  const stop = (event: MouseEvent) => event.stopPropagation();
  const onKey = (event: KeyboardEvent) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); void open(); } };
  return (
    <article role={destination ? "button" : undefined} tabIndex={destination ? 0 : undefined} onClick={() => { if (destination) void open(); }} onKeyDown={onKey}
      className={cn("group relative flex gap-3 border-b border-[var(--line)] px-4 transition-colors duration-200 last:border-b-0", compact ? "py-3" : "py-4 sm:px-5", unread ? "bg-[var(--medical-soft)]/45" : "bg-[var(--surface)]", destination && "cursor-pointer hover:bg-[var(--panel-soft)] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--medical)]")}>
      <span className={cn("mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border", notification.severity === "SUCCESS" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : notification.severity === "WARNING" ? "border-amber-200 bg-amber-50 text-amber-700" : notification.severity === "CRITICAL" ? "border-red-200 bg-red-50 text-red-700" : "border-sky-200 bg-sky-50 text-sky-700")}><Icon size={17} strokeWidth={1.8} aria-hidden="true" /></span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">{unread ? <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--medical)]" aria-label={t("notifications.unread")} /> : null}<h3 className={cn("truncate text-sm", unread ? "font-semibold text-[var(--text-primary)]" : "font-medium text-[var(--text-secondary)]")}>{copy.title}</h3></div>
          <time dateTime={notification.createdAt} className="shrink-0 text-[.68rem] text-[var(--ink-faint)]">{time}</time>
        </div>
        <p className={cn("mt-1 text-xs leading-5 text-[var(--text-secondary)]", compact && "line-clamp-1")}>{copy.description}</p>
        {!compact ? <div className="mt-2 flex flex-wrap items-center justify-between gap-2"><span className="rounded-full border border-[var(--line)] px-2 py-0.5 text-[.65rem] text-[var(--ink-faint)]">{t(`notifications.categories.${notification.category}`)}</span><div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"><button type="button" onClick={(event) => { stop(event); (unread ? actions.read : actions.unread).mutate(notification.id); }} className="clinical-icon-button h-8 w-8" title={t(unread ? "notifications.actions.read" : "notifications.actions.unread")}><span className="sr-only">{t(unread ? "notifications.actions.read" : "notifications.actions.unread")}</span>{unread ? <Check size={14} /> : <RotateCcw size={14} />}</button><button type="button" onClick={(event) => { stop(event); actions.archive.mutate(notification.id); }} className="clinical-icon-button h-8 w-8" title={t("notifications.actions.archive")}><span className="sr-only">{t("notifications.actions.archive")}</span><Archive size={14} /></button>{destination ? <ChevronRight size={15} className="clinical-directional text-[var(--ink-faint)]" aria-hidden="true" /> : null}</div></div> : null}
      </div>
    </article>
  );
}
