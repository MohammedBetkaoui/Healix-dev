import { type TranslationFunction } from "@/lib/i18n";
import { type VerificationDetail } from "@/types/admin";

import { VerificationCompletenessBadge } from "../VerificationCompletenessBadge";
import { VerificationStatusBadge } from "../VerificationStatusBadge";
import { VerificationTypeBadge } from "../VerificationTypeBadge";

type VerificationSummaryCardProps = {
  detail: VerificationDetail;
  t: TranslationFunction;
};

export function VerificationSummaryCard({
  detail,
  t,
}: VerificationSummaryCardProps) {
  const rows = [
    [t("admin.detail.summary.name"), detail.requesterName],
    [t("admin.detail.summary.accountType"), t(`admin.badges.type.${detail.type}`)],
    [t("admin.detail.summary.email"), detail.email],
    [t("admin.detail.summary.phone"), detail.phone],
    [t("admin.detail.summary.wilaya"), `${detail.wilaya} / ${detail.commune}`],
    [t("admin.detail.summary.registeredAt"), detail.registeredAt],
    [t("admin.detail.summary.submittedAt"), detail.submittedAt],
  ];

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-950">
            {t("admin.detail.info.summary")}
          </h2>
          <div className="mt-3 flex flex-wrap gap-2">
            <VerificationTypeBadge t={t} type={detail.type} />
            <VerificationStatusBadge status={detail.status} t={t} />
            <VerificationCompletenessBadge score={detail.completenessScore} t={t} />
          </div>
        </div>
      </div>
      <dl className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map(([label, value]) => (
          <div key={label} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
            <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              {label}
            </dt>
            <dd className="mt-2 text-sm font-medium text-slate-900">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
