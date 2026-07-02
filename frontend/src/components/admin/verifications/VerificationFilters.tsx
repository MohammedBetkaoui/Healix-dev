"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type TranslationFunction } from "@/lib/i18n";
import { type VerificationPriority, type VerificationRequestType, type VerificationStatus } from "@/types/admin";

export type VerificationFilterState = {
  documentsComplete: "ALL" | "YES" | "NO";
  priority: "ALL" | VerificationPriority;
  search: string;
  status: "ALL" | VerificationStatus;
  submittedFrom: string;
  submittedTo: string;
  type: "ALL" | VerificationRequestType;
  wilaya: string;
};

type VerificationFiltersProps = {
  filters: VerificationFilterState;
  onChange: (filters: VerificationFilterState) => void;
  onReset: () => void;
  t: TranslationFunction;
};

const verificationTypes: VerificationRequestType[] = [
  "ESTABLISHMENT",
  "INDEPENDENT_DOCTOR",
];

const verificationStatuses: VerificationStatus[] = [
  "NOT_STARTED",
  "DRAFT",
  "PENDING_VERIFICATION",
  "VERIFIED",
  "REJECTED",
  "SUSPENDED",
];

const priorities: VerificationPriority[] = ["NORMAL", "REVIEW", "URGENT"];

export function VerificationFilters({
  filters,
  onChange,
  onReset,
  t,
}: VerificationFiltersProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="xl:col-span-2">
          <Label htmlFor="verificationSearch">
            {t("admin.verifications.filters.search")}
          </Label>
          <Input
            id="verificationSearch"
            type="search"
            className="mt-2 rounded-xl border-slate-200"
            value={filters.search}
            onChange={(event) =>
              onChange({ ...filters, search: event.target.value })
            }
          />
        </div>

        <div>
          <Label htmlFor="verificationType">
            {t("admin.verifications.filters.type")}
          </Label>
          <select
            id="verificationType"
            className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
            value={filters.type}
            onChange={(event) =>
              onChange({
                ...filters,
                type: event.target.value as VerificationFilterState["type"],
              })
            }
          >
            <option value="ALL">{t("admin.common.all")}</option>
            {verificationTypes.map((type) => (
              <option key={type} value={type}>
                {t(`admin.badges.type.${type}`)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <Label htmlFor="verificationStatus">
            {t("admin.verifications.filters.status")}
          </Label>
          <select
            id="verificationStatus"
            className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
            value={filters.status}
            onChange={(event) =>
              onChange({
                ...filters,
                status: event.target.value as VerificationFilterState["status"],
              })
            }
          >
            <option value="ALL">{t("admin.common.all")}</option>
            {verificationStatuses.map((status) => (
              <option key={status} value={status}>
                {t(`admin.badges.status.${status}`)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <Label htmlFor="verificationWilaya">
            {t("admin.verifications.filters.wilaya")}
          </Label>
          <Input
            id="verificationWilaya"
            className="mt-2 rounded-xl border-slate-200"
            value={filters.wilaya}
            onChange={(event) =>
              onChange({ ...filters, wilaya: event.target.value })
            }
          />
        </div>

        <div>
          <Label htmlFor="verificationSubmittedFrom">
            {t("admin.verifications.filters.submittedFrom")}
          </Label>
          <Input
            id="verificationSubmittedFrom"
            type="date"
            className="mt-2 rounded-xl border-slate-200"
            value={filters.submittedFrom}
            onChange={(event) =>
              onChange({ ...filters, submittedFrom: event.target.value })
            }
          />
        </div>

        <div>
          <Label htmlFor="verificationSubmittedTo">
            {t("admin.verifications.filters.submittedTo")}
          </Label>
          <Input
            id="verificationSubmittedTo"
            type="date"
            className="mt-2 rounded-xl border-slate-200"
            value={filters.submittedTo}
            onChange={(event) =>
              onChange({ ...filters, submittedTo: event.target.value })
            }
          />
        </div>

        <div>
          <Label htmlFor="verificationDocuments">
            {t("admin.verifications.filters.documentsComplete")}
          </Label>
          <select
            id="verificationDocuments"
            className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
            value={filters.documentsComplete}
            onChange={(event) =>
              onChange({
                ...filters,
                documentsComplete: event.target
                  .value as VerificationFilterState["documentsComplete"],
              })
            }
          >
            <option value="ALL">{t("admin.common.all")}</option>
            <option value="YES">{t("admin.common.yes")}</option>
            <option value="NO">{t("admin.common.no")}</option>
          </select>
        </div>

        <div>
          <Label htmlFor="verificationPriority">
            {t("admin.verifications.filters.priority")}
          </Label>
          <select
            id="verificationPriority"
            className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
            value={filters.priority}
            onChange={(event) =>
              onChange({
                ...filters,
                priority: event.target.value as VerificationFilterState["priority"],
              })
            }
          >
            <option value="ALL">{t("admin.common.all")}</option>
            {priorities.map((priority) => (
              <option key={priority} value={priority}>
                {t(`admin.badges.priority.${priority}`)}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-end gap-3">
          <Button type="button" variant="outline" onClick={onReset}>
            {t("admin.actions.reset")}
          </Button>
          <Button type="button">{t("admin.actions.exportCsv")}</Button>
        </div>
      </div>
    </section>
  );
}
