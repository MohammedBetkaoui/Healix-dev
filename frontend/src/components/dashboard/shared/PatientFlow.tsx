import { appointmentFlow } from "@/features/dashboard/dashboard-overview";
import { type DashboardAppointmentStatus } from "@/features/dashboard/dashboard.types";
import type { TranslationFunction } from "@/lib/i18n";

import { WorkspaceLink as Link } from "../layout/WorkspaceLink";

// Today's appointments by status. Each colour comes with its written status.
export function PatientFlow({ byStatus, total, agendaHref, t, formatNumber }: {
  byStatus: Record<DashboardAppointmentStatus, number>;
  total: number;
  agendaHref: string;
  t: TranslationFunction;
  formatNumber: (value: number) => string;
}) {
  const steps = appointmentFlow(byStatus);
  return (
    <section className="surface-section" aria-labelledby="flow-heading">
      <div className="clinical-section-heading">
        <div>
          <h2 id="flow-heading">{t("dashboard.clinical.flow.title")}</h2>
          <p className="clinical-caption mt-1">{t("dashboard.clinical.flow.subtitle", { count: formatNumber(total) })}</p>
        </div>
      </div>
      {total === 0 ? (
        <p className="px-5 pb-5 text-sm text-[var(--text-secondary)]">{t("dashboard.clinical.flow.empty")}</p>
      ) : (
        <dl className="patient-flow">
          {steps.map((step) => <div className="flow-step" key={step.status} data-tone={step.status}>
            <dt className="text-[var(--text-secondary)]">{t(`dashboard.clinical.flow.statuses.${step.status}`)}</dt>
            <dd className="clinical-figure font-semibold">{formatNumber(step.count)}</dd>
            <div className="flow-track" aria-hidden="true"><span style={{ width: `${step.share * 100}%` }} /></div>
          </div>)}
        </dl>
      )}
      <p className="border-t border-[var(--line-soft)] px-5 py-3"><Link href={agendaHref} className="clinical-link">{t("dashboard.clinical.flow.agenda")}</Link></p>
    </section>
  );
}
