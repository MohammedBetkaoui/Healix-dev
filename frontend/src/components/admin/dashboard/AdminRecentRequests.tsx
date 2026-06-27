import Link from "next/link";

import { adminRoutes } from "@/config/admin-routes";
import { type TranslationFunction } from "@/lib/i18n";
import { type AdminDashboardVerificationRequest } from "@/types/admin";

import { VerificationStatusBadge } from "../verifications/VerificationStatusBadge";
import { VerificationTypeBadge } from "../verifications/VerificationTypeBadge";

type AdminRecentRequestsProps = {
  requests: AdminDashboardVerificationRequest[];
  t: TranslationFunction;
};

export function AdminRecentRequests({ requests, t }: AdminRecentRequestsProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 p-5">
        <h2 className="text-lg font-semibold text-slate-950">
          {t("admin.dashboard.recent.title")}
        </h2>
      </div>
      <div className="divide-y divide-slate-100">
        {requests.slice(0, 4).map((request) => (
          <div
            key={request.id}
            className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <p className="font-semibold text-slate-950">
                {request.requesterName}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <VerificationTypeBadge t={t} type={request.type} />
                <VerificationStatusBadge status={request.status} t={t} />
                <span className="text-xs text-slate-500">{request.wilaya}</span>
              </div>
            </div>
            <Link
              href={adminRoutes.verificationDetail(request.id)}
              className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-slate-50"
            >
              {t("admin.actions.viewFile")}
            </Link>
          </div>
        ))}
        {requests.length === 0 ? (
          <div className="p-5 text-sm text-slate-500">
            {t("admin.common.noResults")}
          </div>
        ) : null}
      </div>
    </section>
  );
}
