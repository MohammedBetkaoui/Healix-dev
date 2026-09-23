"use client";

import { Button } from "@/components/ui/button";
import { type Locale } from "@/i18n";
import { formatAdminDateTime } from "@/lib/date-format";
import { type TranslationFunction } from "@/lib/i18n";
import { type AdminAuditLogItem } from "@/types/admin";

import { AdminAuditActionBadge } from "./AdminAuditActionBadge";
import { getAuditEntityLabel } from "./audit-presentation";

type AdminAuditLogsTableProps = {
  locale: Locale;
  logs: AdminAuditLogItem[];
  onViewDetails: (log: AdminAuditLogItem) => void;
  t: TranslationFunction;
};

export function getAuditStatus(action: string): "FAILED" | "INFO" | "SUCCESS" {
  if (action.includes("FAILED") || action.includes("REJECTED")) {
    return "FAILED";
  }

  if (
    action.includes("SUCCESS") ||
    action.includes("APPROVED") ||
    action.includes("SUBMITTED") ||
    action.includes("UPLOADED") ||
    action.includes("LOGOUT")
  ) {
    return "SUCCESS";
  }

  return "INFO";
}

export function AdminAuditLogsTable({
  locale,
  logs,
  onViewDetails,
  t,
}: AdminAuditLogsTableProps) {
  if (logs.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
        {t("admin.common.noResults")}
      </div>
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-border text-sm">
          <thead className="bg-muted text-xs uppercase tracking-[0.12em] text-muted-foreground">
            <tr>
              <th className="px-5 py-4 text-start">{t("admin.audit.table.date")}</th>
              <th className="px-5 py-4 text-start">{t("admin.audit.table.user")}</th>
              <th className="px-5 py-4 text-start">{t("admin.audit.table.role")}</th>
              <th className="px-5 py-4 text-start">{t("admin.audit.table.action")}</th>
              <th className="px-5 py-4 text-start">{t("admin.audit.table.entity")}</th>
              <th className="px-5 py-4 text-start">{t("admin.audit.table.ip")}</th>
              <th className="px-5 py-4 text-start">{t("admin.audit.table.status")}</th>
              <th className="px-5 py-4 text-start">{t("admin.audit.table.details")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {logs.map((log) => (
              <tr key={log.id}>
                <td className="px-5 py-4 text-muted-foreground">
                  {formatAdminDateTime(log.createdAt, locale)}
                </td>
                <td className="px-5 py-4 font-semibold text-foreground">
                  {log.userName ?? t("admin.common.system")}
                </td>
                <td className="px-5 py-4 text-muted-foreground">
                  {log.userRole ?? "-"}
                </td>
                <td className="px-5 py-4">
                  <AdminAuditActionBadge action={log.action} t={t} />
                </td>
                <td className="px-5 py-4 text-muted-foreground">
                  {getAuditEntityLabel(log.entityType, t)}
                </td>
                <td className="px-5 py-4 text-muted-foreground">
                  {log.ipAddress ?? "-"}
                </td>
                <td className="px-5 py-4 text-muted-foreground">
                  {t(`admin.badges.auditStatus.${getAuditStatus(log.action)}`)}
                </td>
                <td className="px-5 py-4">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onViewDetails(log)}
                  >
                    {t("admin.actions.viewDetails")}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
