"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type TranslationFunction } from "@/lib/i18n";
import {
  type RegisteredUserRole,
  type RegisteredUserStatus,
} from "@/types/admin";

export type AdminUserFilterState = {
  role: "ALL" | RegisteredUserRole;
  search: string;
  status: "ALL" | RegisteredUserStatus;
  wilaya: string;
};

type AdminUserFiltersProps = {
  filters: AdminUserFilterState;
  onChange: (filters: AdminUserFilterState) => void;
  onReset: () => void;
  t: TranslationFunction;
};

const roles: RegisteredUserRole[] = [
  "SUPER_ADMIN",
  "ADMIN_VERIFICATION",
  "ESTABLISHMENT_ADMIN",
  "INDEPENDENT_DOCTOR",
];

const statuses: RegisteredUserStatus[] = [
  "BASIC_ACCOUNT",
  "PENDING_VERIFICATION",
  "VERIFIED_NO_PLAN",
  "PAYMENT_PENDING",
  "ACTIVE",
  "REJECTED",
  "SUSPENDED",
];

export function AdminUserFilters({
  filters,
  onChange,
  onReset,
  t,
}: AdminUserFiltersProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="xl:col-span-2">
          <Label htmlFor="userSearch">{t("admin.users.filters.search")}</Label>
          <Input
            id="userSearch"
            type="search"
            className="mt-2 rounded-xl border-slate-200"
            value={filters.search}
            onChange={(event) =>
              onChange({ ...filters, search: event.target.value })
            }
          />
        </div>
        <div>
          <Label htmlFor="userRole">{t("admin.users.filters.role")}</Label>
          <select
            id="userRole"
            className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
            value={filters.role}
            onChange={(event) =>
              onChange({
                ...filters,
                role: event.target.value as AdminUserFilterState["role"],
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
          <Label htmlFor="userStatus">{t("admin.users.filters.status")}</Label>
          <select
            id="userStatus"
            className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
            value={filters.status}
            onChange={(event) =>
              onChange({
                ...filters,
                status: event.target.value as AdminUserFilterState["status"],
              })
            }
          >
            <option value="ALL">{t("admin.common.all")}</option>
            {statuses.map((status) => (
              <option key={status} value={status}>
                {t(`admin.badges.accountStatus.${status}`)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="userWilaya">{t("admin.users.filters.wilaya")}</Label>
          <Input
            id="userWilaya"
            className="mt-2 rounded-xl border-slate-200"
            value={filters.wilaya}
            onChange={(event) =>
              onChange({ ...filters, wilaya: event.target.value })
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
