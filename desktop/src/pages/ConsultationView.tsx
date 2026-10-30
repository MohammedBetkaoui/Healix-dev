import { Lock, Stethoscope, TriangleAlert } from "lucide-react";
import { Notice, PageHeader, StatusBadge } from "../dashboard-ui";
import { formatDateOnly } from "../dates";
import { fr } from "../i18n/fr";
import { consultationState } from "../statuses";
import type { ConsultationDetail } from "../types";
import { bmi, formatBmi, VITAL_FIELDS, vitalFlags, type FlagKey } from "../vitals";

const decimal = (value: number) => String(value).replace(".", ",");

const SECTION_KEYS = [
  "chiefComplaint", "historyPresentIllness", "clinicalExamination", "assessment", "carePlan", "followUpPlan",
] as const satisfies ReadonlyArray<keyof ConsultationDetail>;

// A consultation that is no longer a local draft (synchronized, in conflict, or
// of a record locked out of the authorized scope): shown, never edited.
export function ConsultationView({ consultation }: { consultation: ConsultationDetail }) {
  const state = consultationState(consultation.state);
  const values = consultation.vitalSigns ?? {};
  const vitals = VITAL_FIELDS.filter((field) => values[field.key] != null);
  const index = bmi(values.weightKg, values.heightCm);
  const flags = vitalFlags(values);
  const notice =
    consultation.state === "CONFLICT"
      ? fr.consultation.conflict
      : consultation.patientLocked
        ? fr.consultation.lockedPatient
        : fr.consultation.readOnly;

  return (
    <section className="workspace-stack" aria-label="Consultation en lecture seule">
      <PageHeader
        icon={<Stethoscope className="h-5 w-5" strokeWidth={1.7} aria-hidden="true" />}
        eyebrow={`${fr.header.titles.consultation} · ${formatDateOnly(consultation.date)}`}
        title={consultation.patientName}
        description={consultation.chiefComplaint || undefined}
        actions={<StatusBadge label={state.label} tone={state.tone} />}
      />
      <Notice
        tone={consultation.state === "CONFLICT" ? "danger" : "neutral"}
        icon={
          consultation.state === "CONFLICT"
            ? <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.8} aria-hidden="true" />
            : <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.8} aria-hidden="true" />
        }
      >
        {notice}
      </Notice>

      <div className="surface-section p-5 sm:p-6">
        <dl className="grid gap-5 md:grid-cols-2">
          {SECTION_KEYS.map((key) => (
            <div key={key}>
              <dt className="text-xs font-semibold text-[var(--ink-soft)]">{fr.consultation.sections[key]}</dt>
              <dd className="mt-1.5 whitespace-pre-wrap text-sm leading-6 text-[var(--ink)]">
                {consultation[key] || <span className="text-[var(--ink-faint)]">{fr.consultation.none}</span>}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      {vitals.length ? (
        <section className="surface-section p-5 sm:p-6" aria-label={fr.consultation.vitals.title}>
          <h2 className="text-sm font-semibold text-[var(--ink)]">{fr.consultation.vitals.title}</h2>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {vitals.map((field) => (
              <div key={field.key}>
                <dt className="text-xs text-[var(--ink-soft)]">{field.label}</dt>
                <dd className="clinical-figure mt-1 text-base font-semibold text-[var(--ink)]">
                  {decimal(values[field.key] as number)} <span className="text-xs font-normal text-[var(--ink-faint)]">{field.unit}</span>
                </dd>
              </div>
            ))}
            {index !== null ? (
              <div>
                <dt className="text-xs text-[var(--ink-soft)]">IMC</dt>
                <dd className="clinical-figure mt-1 text-base font-semibold text-[var(--ink)]" data-bmi="">
                  {formatBmi(index)} <span className="text-xs font-normal text-[var(--ink-faint)]">kg/m²</span>
                </dd>
              </div>
            ) : null}
          </dl>
          {Object.keys(flags).length ? (
            <ul aria-label="Valeurs à surveiller" className="mt-4 flex flex-wrap gap-2">
              {(Object.keys(flags) as FlagKey[]).map((key) => (
                <li key={key}><StatusBadge label={flags[key]!.text} tone={flags[key]!.level === "alert" ? "danger" : "warning"} /></li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {consultation.diagnoses.length ? (
        <section className="surface-section p-5 sm:p-6" aria-label={fr.consultation.diagnoses}>
          <h2 className="text-sm font-semibold text-[var(--ink)]">{fr.consultation.diagnoses}</h2>
          <ul className="mt-4 space-y-3">
            {consultation.diagnoses.map((diagnosis, index) => (
              <li key={`${diagnosis.label}-${index}`} className="flex flex-wrap items-center gap-2 text-sm text-[var(--ink)]">
                <span className="font-medium">{diagnosis.label}</span>
                {diagnosis.code ? <span className="clinical-figure text-xs text-[var(--ink-faint)]">{diagnosis.code}</span> : null}
                {diagnosis.isPrimary ? <StatusBadge label={fr.consultation.primary} tone="info" /> : null}
                {diagnosis.note ? <span className="w-full text-xs text-[var(--ink-soft)]">{diagnosis.note}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {consultation.addenda.length ? (
        <section className="surface-section p-5 sm:p-6" aria-label={fr.consultation.addenda}>
          <h2 className="text-sm font-semibold text-[var(--ink)]">{fr.consultation.addenda}</h2>
          <ul className="mt-4 space-y-3">
            {consultation.addenda.map((addendum) => (
              <li key={addendum.id} className="whitespace-pre-wrap text-sm text-[var(--ink)]">{addendum.content}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </section>
  );
}
