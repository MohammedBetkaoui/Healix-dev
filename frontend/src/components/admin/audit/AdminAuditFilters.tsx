"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type TranslationFunction } from "@/lib/i18n";
import {
  type AuditAction,
  type RegisteredUserRole,
} from "@/types/admin";

export type AuditFilterState = {
  action: "ALL" | AuditAction;
  ipAddress: string;
  role: "ALL" | RegisteredUserRole;
  search: string;
  status: "ALL" | "SUCCESS" | "FAILED" | "INFO";
};

type AdminAuditFiltersProps = {
  filters: AuditFilterState;
  onChange: (filters: AuditFilterState) => void;
  onReset: () => void;
  t: TranslationFunction;
};

const actions: AuditAction[] = [
  "ADMIN_LOGIN_SUCCESS",
  "ADMIN_LOGIN_FAILED",
  "ESTABLISHMENT_VERIFICATION_SUBMITTED",
  "DOCTOR_VERIFICATION_SUBMITTED",
  "VERIFICATION_APPROVED",
  "VERIFICATION_REJECTED",
  "LOGOUT",
];

const roles: RegisteredUserRole[] = [
  "SUPER_ADMIN",
  "ADMIN_VERIFICATION",
  "ESTABLISHMENT_ADMIN",
  "INDEPENDENT_DOCTOR",
];

const statuses: Array<AuditFilterState["status"]> = [
  "SUCCESS",
  "FAILED",
  "INFO",
];

export function AdminAuditFilters({
  filters,
  onChange,
  onReset,
  t,
}: AdminAuditFiltersProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="xl:col-span-2">
          <Label htmlFor="auditSearch">{t("admin.audit.filters.search")}</Label>
          <Input
            id="auditSearch"
            type="search"
            className="mt-2 rounded-xl border-slate-200"
            value={filters.search}
            onChange={(event) =>
              onChange({ ...filters, search: event.target.value })
            }
          />
        </div>
        <div>
          <Label htmlFor="auditAction">{t("admin.audit.filters.action")}</Label>
          <select
            id="auditAction"
            className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
            value={filters.action}
            onChange={(event) =>
              onChange({
                ...filters,
                action: event.target.value as AuditFilterState["action"],
              })
            }
          >
            <option value="ALL">{t("admin.common.all")}</option>
            {actions.map((action) => (
              <option key={action} value={action}>
                {action}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="auditRole">{t("admin.audit.filters.role")}</Label>
          <select
            id="auditRole"
            className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
            value={filters.role}
            onChange={(event) =>
              onChange({
                ...filters,
                role: event.target.value as AuditFilterState["role"],
              })
            }
          >
            <option value="ALL">{t("admin.common.all")}</option>
            {roles.map((role) => (
              <option key={role} value={role}>
                {t(`admin.badges.roles.${role}`)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="auditStatus">{t("admin.audit.filters.status")}</Label>
          <select
            id="auditStatus"
            className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
            value={filters.status}
            onChange={(event) =>
              onChange({
                ...filters,
                status: event.target.value as AuditFilterState["status"],
              })
            }
          >
            <option value="ALL">{t("admin.common.all")}</option>
            {statuses.map((status) => (
              <option key={status} value={status}>
                {t(`admin.badges.auditStatus.${status}`)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="auditIp">{t("admin.audit.filters.ip")}</Label>
          <Input
            id="auditIp"
            className="mt-2 rounded-xl border-slate-200"
            value={filters.ipAddress}
            onChange={(event) =>
              onChange({ ...filters, ipAddress: event.target.value })
            }
          />
        </div>
        <div className="flex items-end">
          <Button type="button" variant="outline" onClick={onReset}>
            {t("admin.actions.reset")}
          </Button>
        </div>
      </div>
    </section>
  );
}
