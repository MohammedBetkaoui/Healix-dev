"use client";

import {
  Activity,
  CalendarClock,
  Database,
  Fingerprint,
  Globe2,
  Monitor,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";
import { type ComponentType } from "react";

import { Button } from "@/components/ui/button";
import { type Locale } from "@/i18n";
import { formatAdminDateTime } from "@/lib/date-format";
import { type TranslationFunction } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { type AdminAuditLogItem } from "@/types/admin";

import {
  getAuditActionDescription,
  getAuditActionLabel,
  getAuditEntityLabel,
  getAuditMetadataEntries,
  getAuditTone,
} from "./audit-presentation";

type AdminAuditLogDetailModalProps = {
  locale: Locale;
  log: AdminAuditLogItem | null;
  onClose: () => void;
  t: TranslationFunction;
};

type DetailItemProps = {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
};

const toneStyles = {
  danger: {
    badge: "border-[var(--danger-line)] bg-[var(--danger-soft)] text-[var(--danger-ink)]",
    icon: "bg-[var(--danger-soft)] text-[var(--danger-ink)]",
    panel: "border-[var(--danger-line)] bg-[var(--danger-soft)]/50",
  },
  info: {
    badge: "border-[var(--accent-line)] bg-secondary text-[var(--accent-dark)]",
    icon: "bg-secondary text-[var(--accent-dark)]",
    panel: "border-[var(--accent-line)] bg-secondary/50",
  },
  success: {
    badge: "border-[var(--success-line)] bg-[var(--success-soft)] text-[var(--success-ink)]",
    icon: "bg-[var(--success-soft)] text-[var(--success-ink)]",
    panel: "border-[var(--success-line)] bg-[var(--success-soft)]/50",
  },
  warning: {
    badge: "border-[var(--warning-line)] bg-[var(--warning-soft)] text-[var(--warning-ink)]",
    icon: "bg-[var(--warning-soft)] text-[var(--warning-ink)]",
    panel: "border-[var(--warning-line)] bg-[var(--warning-soft)]/50",
  },
};

function DetailItem({ icon: Icon, label, value }: DetailItemProps) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {label}
          </p>
          <p className="mt-1 break-words text-sm font-medium leading-6 text-foreground">
            {value}
          </p>
        </div>
      </div>
    </div>
  );
}

export function AdminAuditLogDetailModal({
  locale,
  log,
  onClose,
  t,
}: AdminAuditLogDetailModalProps) {
  if (!log) {
    return null;
  }

  const tone = getAuditTone(log.action);
  const actionLabel = getAuditActionLabel(log.action, t);
  const entityLabel = getAuditEntityLabel(log.entityType, t);
  const metadataEntries = getAuditMetadataEntries(log.metadata, t);
  const statusLabel = t(
    `admin.badges.auditStatus.${
      tone === "danger" ? "FAILED" : tone === "success" ? "SUCCESS" : "INFO"
    }`,
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label={t("admin.actions.close")}
        className="absolute inset-0 bg-[#0f172a]/35 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative max-h-[92vh] w-full max-w-4xl overflow-hidden rounded-3xl border border-border bg-card shadow-2xl">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-4 top-4 z-10"
          aria-label={t("admin.actions.close")}
          onClick={onClose}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
        <div className="max-h-[92vh] overflow-y-auto p-6">
          <div
            className={cn(
              "rounded-3xl border p-5",
              toneStyles[tone].panel,
            )}
          >
            <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
              <div className="flex items-start gap-4">
                <span
                  className={cn(
                    "flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl",
                    toneStyles[tone].icon,
                  )}
                >
                  <ShieldCheck className="h-6 w-6" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    {t("admin.audit.detailTitle")}
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold text-foreground">
                    {actionLabel}
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                    {getAuditActionDescription(log, t)}
                  </p>
                </div>
              </div>
              <span
                className={cn(
                  "inline-flex w-fit rounded-full border px-3 py-1 text-xs font-semibold",
                  toneStyles[tone].badge,
                )}
              >
                {statusLabel}
              </span>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <DetailItem
              icon={UserRound}
              label={t("admin.audit.detail.actor")}
              value={log.userName ?? t("admin.common.system")}
            />
            <DetailItem
              icon={CalendarClock}
              label={t("admin.audit.detail.date")}
              value={formatAdminDateTime(log.createdAt, locale)}
            />
            <DetailItem
              icon={Activity}
              label={t("admin.audit.detail.action")}
              value={actionLabel}
            />
            <DetailItem
              icon={Database}
              label={t("admin.audit.detail.entity")}
              value={entityLabel}
            />
            <DetailItem
              icon={Fingerprint}
              label={t("admin.audit.detail.role")}
              value={
                log.userRole ? t(`admin.badges.roles.${log.userRole}`) : "-"
              }
            />
            <DetailItem
              icon={Globe2}
              label={t("admin.audit.detail.ip")}
              value={log.ipAddress ?? "-"}
            />
          </div>

          <section className="mt-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                <Monitor className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  {t("admin.audit.detail.device")}
                </p>
                <p className="mt-1 break-words text-sm leading-6 text-foreground">
                  {log.userAgent ?? t("admin.audit.detail.unknownDevice")}
                </p>
              </div>
            </div>
          </section>

          <section className="mt-6 rounded-2xl border border-border bg-muted p-5">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-base font-semibold text-foreground">
                  {t("admin.audit.detail.contextTitle")}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("admin.audit.detail.contextDescription")}
                </p>
              </div>
              {log.entityId ? (
                <span className="mt-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground sm:mt-0">
                  {t("admin.audit.detail.entityId")}: {log.entityId}
                </span>
              ) : null}
            </div>

            {metadataEntries.length > 0 ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {metadataEntries.map((entry) => (
                  <div
                    key={entry.label}
                    className="rounded-xl border border-border bg-card p-3"
                  >
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      {entry.label}
                    </p>
                    <p className="mt-1 break-words text-sm font-medium text-foreground">
                      {entry.value}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-4 rounded-xl border border-dashed border-border bg-card p-4 text-sm text-muted-foreground">
                {t("admin.audit.detail.noMetadata")}
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
