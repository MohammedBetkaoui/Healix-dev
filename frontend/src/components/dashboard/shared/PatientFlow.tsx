import type { TranslationFunction } from "@/lib/i18n";

type FlowStep = { key: "planned" | "arrived" | "waiting" | "consulting" | "completed"; count: number };

export function PatientFlow({ steps, t, formatNumber }: { steps: readonly FlowStep[]; t: TranslationFunction; formatNumber: (value: number) => string }) {
  const total = Math.max(1, ...steps.map((step) => step.count));
  return (
    <section className="surface-section" aria-labelledby="flow-heading">
      <div className="clinical-section-heading"><div><h2 id="flow-heading">{t("dashboard.clinical.flow.title")}</h2><p className="clinical-caption mt-1">{t("dashboard.clinical.flow.subtitle")}</p></div></div>
      <dl className="patient-flow">
        {steps.map((step) => <div className="flow-step" key={step.key} data-tone={step.key}>
          <dt className="text-[var(--text-secondary)]">{t(`dashboard.clinical.flow.${step.key}`)}</dt>
          <dd className="font-semibold">{formatNumber(step.count)}</dd>
          <div className="flow-track" aria-hidden="true"><span style={{ width: `${step.count / total * 100}%` }} /></div>
        </div>)}
      </dl>
      <p className="clinical-caption border-t border-[var(--line-soft)] px-5 py-3">{t("dashboard.clinical.flow.note")}</p>
    </section>
  );
}
