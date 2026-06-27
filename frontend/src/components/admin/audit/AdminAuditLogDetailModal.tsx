"use client";

import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { type TranslationFunction } from "@/lib/i18n";
import { type AdminAuditLogItem } from "@/types/admin";

type AdminAuditLogDetailModalProps = {
  log: AdminAuditLogItem | null;
  onClose: () => void;
  t: TranslationFunction;
};

export function AdminAuditLogDetailModal({
  log,
  onClose,
  t,
}: AdminAuditLogDetailModalProps) {
  if (!log) {
    return null;
  }

  const metadata =
    log.metadata && typeof log.metadata === "object"
      ? JSON.stringify(log.metadata, null, 2)
      : "-";

  const rows = [
    [t("admin.audit.table.date"), log.createdAt],
    [t("admin.audit.table.user"), log.userName ?? t("admin.common.system")],
    [t("admin.audit.table.role"), log.userRole ?? "-"],
    [t("admin.audit.table.action"), log.action],
    [t("admin.audit.table.entity"), log.entityType],
    [t("admin.audit.table.ip"), log.ipAddress ?? "-"],
    [t("admin.audit.table.userAgent"), log.userAgent ?? "-"],
    [t("admin.audit.table.details"), metadata],
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label={t("admin.actions.close")}
        className="absolute inset-0 bg-slate-950/35 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-4 top-4"
          aria-label={t("admin.actions.close")}
          onClick={onClose}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
        <h2 className="text-xl font-semibold text-slate-950">
          {t("admin.audit.detailTitle")}
        </h2>
        <dl className="mt-6 grid gap-3 sm:grid-cols-2">
          {rows.map(([label, value]) => (
            <div key={label} className="rounded-xl bg-slate-50 p-4">
              <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                {label}
              </dt>
              <dd className="mt-2 text-sm font-medium text-slate-900">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
