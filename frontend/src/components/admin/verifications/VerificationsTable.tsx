import Link from "next/link";

import { adminRoutes } from "@/config/admin-routes";
import { type Locale } from "@/i18n";
import { formatAdminDateTime } from "@/lib/date-format";
import { type TranslationFunction } from "@/lib/i18n";
import { type AdminVerificationListItem } from "@/types/admin";

import { VerificationCompletenessBadge } from "./VerificationCompletenessBadge";
import { VerificationStatusBadge } from "./VerificationStatusBadge";
import { VerificationTypeBadge } from "./VerificationTypeBadge";

type VerificationsTableProps = {
  locale: Locale;
  requests: AdminVerificationListItem[];
  t: TranslationFunction;
};

export function VerificationsTable({
  locale,
  requests,
  t,
}: VerificationsTableProps) {
  if (requests.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
        {t("admin.common.noResults")}
      </div>
    );
  }

  return (
    <section className="rounded-2xl border border-border bg-card shadow-sm">
      <div className="hidden overflow-x-auto lg:block">
        <table className="min-w-full divide-y divide-border text-sm">
          <thead className="bg-muted text-xs uppercase tracking-[0.12em] text-muted-foreground">
            <tr>
              <th className="px-5 py-4 text-start">{t("admin.verifications.table.requester")}</th>
              <th className="px-5 py-4 text-start">{t("admin.verifications.table.type")}</th>
              <th className="px-5 py-4 text-start">{t("admin.verifications.table.wilaya")}</th>
              <th className="px-5 py-4 text-start">{t("admin.verifications.table.status")}</th>
              <th className="px-5 py-4 text-start">{t("admin.verifications.table.documents")}</th>
              <th className="px-5 py-4 text-start">{t("admin.verifications.table.submittedAt")}</th>
              <th className="px-5 py-4 text-start">{t("admin.verifications.table.updatedAt")}</th>
              <th className="px-5 py-4 text-start">{t("admin.verifications.table.completeness")}</th>
              <th className="px-5 py-4 text-start">{t("admin.verifications.table.action")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {requests.map((request) => (
              <tr key={request.id} className="align-middle">
                <td className="px-5 py-4">
                  <p className="font-semibold text-foreground">{request.requesterName}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{request.email}</p>
                </td>
                <td className="px-5 py-4">
                  <VerificationTypeBadge t={t} type={request.type} />
                </td>
                <td className="px-5 py-4 text-muted-foreground">{request.wilaya}</td>
                <td className="px-5 py-4">
                  <VerificationStatusBadge status={request.status} t={t} />
                </td>
                <td className="px-5 py-4 text-muted-foreground">
                  {t("admin.verifications.table.docsShort", {
                    completed: request.documentsCount,
                    total: request.requiredDocumentsCount,
                  })}
                </td>
                <td className="px-5 py-4 text-muted-foreground">
                  {formatAdminDateTime(request.submittedAt, locale)}
                </td>
                <td className="px-5 py-4 text-muted-foreground">
                  {formatAdminDateTime(request.updatedAt, locale)}
                </td>
                <td className="px-5 py-4">
                  <VerificationCompletenessBadge
                    score={request.completenessScore}
                    t={t}
                  />
                </td>
                <td className="px-5 py-4">
                  <Link
                    href={adminRoutes.verificationDetail(request.id)}
                    className="font-semibold text-[var(--accent-dark)] hover:text-[var(--accent-dark)]"
                  >
                    {t("admin.actions.viewFile")}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-3 p-4 lg:hidden">
        {requests.map((request) => (
          <article
            key={request.id}
            className="rounded-2xl border border-border bg-muted p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-foreground">
                  {request.requesterName}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{request.email}</p>
              </div>
              <VerificationCompletenessBadge score={request.completenessScore} t={t} />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <VerificationTypeBadge t={t} type={request.type} />
              <VerificationStatusBadge status={request.status} t={t} />
              <span className="rounded-full bg-card px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                {request.wilaya}
              </span>
            </div>
            <div className="mt-4 grid gap-2 rounded-xl border border-border bg-card p-3 text-xs text-muted-foreground">
              <p>
                <span className="font-semibold text-foreground">
                  {t("admin.verifications.table.submittedAt")}:
                </span>{" "}
                {formatAdminDateTime(request.submittedAt, locale)}
              </p>
              <p>
                <span className="font-semibold text-foreground">
                  {t("admin.verifications.table.updatedAt")}:
                </span>{" "}
                {formatAdminDateTime(request.updatedAt, locale)}
              </p>
            </div>
            <Link
              href={adminRoutes.verificationDetail(request.id)}
              className="mt-4 inline-flex text-sm font-semibold text-[var(--accent-dark)]"
            >
              {t("admin.actions.viewFile")}
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}
