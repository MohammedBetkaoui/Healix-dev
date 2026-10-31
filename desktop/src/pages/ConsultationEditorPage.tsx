import { useState } from "react";
import { CheckCircle2, ChevronDown, FilePlus2, Plus, Quote, Sparkles, Stethoscope, Trash2, TriangleAlert } from "lucide-react";
import { appendCitation, citationOf, conclusionOf, decidedOn, isCited, specialtyColor, specialtyOf } from "../ai-reports";
import {
  addDiagnosis, hasClinicalContent, MAX_DIAGNOSES, removeDiagnosis, setPrimaryDiagnosis,
  type ConsultationForm, type FormProblems,
} from "../consultation-form";
import { Button, Field, Notice, PageHeader, Pill, StatusBadge, cn, inputClass, textareaClass } from "../dashboard-ui";
import { capitalize, formatTime } from "../dates";
import { fr } from "../i18n/fr";
import type { AiReport } from "../types";
import { bmi, formatBmi, VITAL_FIELDS, vitalFlags, vitalsFromForm, type FlagKey, type VitalFlag, type VitalKey } from "../vitals";

export type SaveState =
  | { kind: "clean" }
  | { kind: "dirty" }
  | { kind: "saving" }
  | { kind: "saved"; at: Date }
  | { kind: "error"; message: string };

// "Enregistré sur cet appareil à 10:42": the doctor always knows whether what
// was typed is safe on this device.
export function SaveIndicator({ state }: { state: SaveState }) {
  const text =
    state.kind === "saved"
      ? `Enregistré sur cet appareil à ${formatTime(state.at.toISOString())}`
      : state.kind === "saving"
        ? "Enregistrement…"
        : state.kind === "dirty"
          ? "Modifications non enregistrées"
          : state.kind === "error"
            ? "Enregistrement impossible"
            : "Aucune modification";
  return (
    <p
      role="status"
      aria-live="polite"
      data-save-state={state.kind}
      className={cn("text-xs", state.kind === "error" ? "font-medium text-[var(--danger-ink)]" : "text-[var(--ink-faint)]")}
    >
      {state.kind === "saved" ? <CheckCircle2 className="me-1 inline h-3.5 w-3.5 text-[var(--success)]" strokeWidth={1.8} aria-hidden="true" /> : null}
      {text}
    </p>
  );
}

const flagTone = (flag: VitalFlag) => (flag.level === "alert" ? "danger" : "warning");

function Flag({ flag, detail }: { flag: VitalFlag; detail: string }) {
  // The words carry the meaning, the colour repeats it.
  return (
    <li className="flex items-center gap-2 text-xs text-[var(--ink)]" data-flag={flag.level}>
      <StatusBadge label={flag.text} tone={flagTone(flag)} />
      <span className="clinical-figure text-[var(--ink-soft)]">{detail}</span>
    </li>
  );
}

// The last validated AI results of the patient, folded away by default. Nothing
// is written into the consultation unless the doctor clicks "Citer", and what is
// inserted can be edited like the rest of the text.
function AiContext({ reports, assessment, onCite }: { reports: AiReport[]; assessment: string; onCite: (report: AiReport) => void }) {
  const [open, setOpen] = useState(false);
  if (!reports.length) return null;
  return (
    <section className="surface-section overflow-hidden" aria-labelledby="consultation-ai" data-ai-context="">
      <h2 id="consultation-ai" className="text-sm font-semibold text-[var(--ink)]">
        <button
          type="button"
          className="flex w-full items-center gap-2 px-5 py-4 text-start sm:px-6"
          aria-expanded={open}
          aria-controls="consultation-ai-body"
          onClick={() => setOpen((current) => !current)}
        >
          <Sparkles className="h-4 w-4 text-[var(--accent-dark)]" strokeWidth={1.8} aria-hidden="true" />
          {fr.ai.context.title}
          <span className="team-tab-count">{reports.length}</span>
          <span className="ms-1 text-xs font-normal text-[var(--ink-faint)]">{fr.ai.context.hint}</span>
          <ChevronDown className={cn("ms-auto h-4 w-4 transition", open && "rotate-180")} strokeWidth={1.8} aria-hidden="true" />
        </button>
      </h2>
      {open ? (
        <div id="consultation-ai-body" className="border-t border-[var(--line)]">
          <p className="px-5 pt-3 text-[0.68rem] text-[var(--ink-faint)] sm:px-6" data-ai-disclaimer="">{fr.ai.disclaimer}</p>
          <ul className="divide-y divide-[var(--line)]">
            {reports.map((report) => {
              const cited = isCited(assessment, report);
              const specialty = specialtyOf(report.pipeline);
              return (
                <li key={report.runId} className="flex flex-wrap items-center gap-3 px-5 py-3.5 sm:px-6" data-specialty={specialty} style={{ borderInlineStart: `3px solid ${specialtyColor(specialty)}` }}>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-[var(--ink)]">{capitalize(conclusionOf(report))}</span>
                    <span className="block text-xs text-[var(--ink-faint)]">
                      {report.moduleLabel} · {decidedOn(report)}{report.reportNumber ? ` · ${report.reportNumber}` : ""}
                    </span>
                  </span>
                  <StatusBadge label={fr.ai.decisions[report.decisionStatus] ?? report.decisionStatus} tone={report.decisionStatus === "CORRECTED" ? "warning" : "success"} />
                  <Button variant="outline" size="sm" disabled={cited} aria-label={`${cited ? fr.ai.context.cited : fr.ai.context.cite} : ${report.moduleLabel}, ${decidedOn(report)}`} onClick={() => onCite(report)}>
                    <Quote className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
                    {cited ? fr.ai.context.cited : fr.ai.context.cite}
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

const FLAG_FOR: Record<VitalKey, FlagKey | null> = {
  systolicBp: "bloodPressure", diastolicBp: "bloodPressure", heartRate: "heartRate", respiratoryRate: "respiratoryRate",
  oxygenSaturation: "oxygenSaturation", temperature: "temperature", weightKg: null, heightCm: null,
};

export function ConsultationEditorPage({
  patientName, value, onChange, saveState, problems, finished, aiReports = [], onFieldBlur, onSave, onFinish, onWritePrescription, onClose,
}: {
  patientName: string;
  value: ConsultationForm;
  onChange: (value: ConsultationForm) => void;
  saveState: SaveState;
  // Why the last attempt to save or to finish was refused, if it was.
  problems: FormProblems | null;
  // The consultation was just finished: the prescription is offered.
  finished: boolean;
  // The last validated AI results of the patient (at most 3), read from this device.
  aiReports?: AiReport[];
  onFieldBlur: () => void;
  onSave: () => void;
  onFinish: () => void;
  onWritePrescription: () => void;
  onClose: () => void;
}) {
  const { values, errors } = vitalsFromForm(value.vitals);
  const flags = vitalFlags(values);
  const index = bmi(values.weightKg, values.heightCm);
  const busy = saveState.kind === "saving";
  const readyToFinish = hasClinicalContent(value);

  const text = (key: "chiefComplaint" | "historyPresentIllness" | "clinicalExamination" | "assessment" | "carePlan" | "followUpPlan", label: string) => (
    <Field label={label}>
      <textarea
        className={textareaClass}
        value={value[key]}
        onChange={(event) => onChange({ ...value, [key]: event.target.value })}
      />
    </Field>
  );

  const setVital = (key: VitalKey, next: string) =>
    onChange({ ...value, vitals: { ...value.vitals, [key]: next }, vitalsTouched: true });

  const comma = (value: number | null | undefined) => String(value).replace(".", ",");
  const flagDetail = (flag: FlagKey) =>
    flag === "bloodPressure"
      ? `${values.systolicBp ?? "—"}/${values.diastolicBp ?? "—"} mmHg`
      : flag === "heartRate"
        ? `${comma(values.heartRate)} bpm`
        : flag === "respiratoryRate"
          ? `${comma(values.respiratoryRate)} /min`
          : flag === "oxygenSaturation"
            ? `${comma(values.oxygenSaturation)} %`
            : flag === "temperature"
              ? `${comma(values.temperature)} °C`
              : `IMC ${formatBmi(index!)}`;

  return (
    <section className="workspace-stack" aria-label="Consultation hors ligne" onBlur={onFieldBlur}>
      <PageHeader
        icon={<Stethoscope className="h-5 w-5" strokeWidth={1.7} aria-hidden="true" />}
        eyebrow="Consultation hors ligne"
        title={patientName}
        actions={<Pill tone={value.localStatus === "READY_TO_SYNC" ? "success" : "warning"}>{value.localStatus === "READY_TO_SYNC" ? "Prête à synchroniser" : "Brouillon local"}</Pill>}
      />

      {finished ? (
        <section role="status" data-finished="" className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--success-line)] bg-[var(--success-soft)] px-5 py-4 text-[var(--success-ink)]">
          <p className="min-w-0 text-sm font-semibold">
            Consultation terminée. Elle est enregistrée sur cet appareil et partira à la prochaine synchronisation.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={onWritePrescription}>
              <FilePlus2 className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
              Rédiger l’ordonnance
            </Button>
            <Button variant="outline" onClick={onClose}>Plus tard</Button>
          </div>
        </section>
      ) : null}

      {problems?.messages.length ? (
        <Notice tone="danger" icon={<TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.8} aria-hidden="true" />}>
          <ul className="space-y-1">{problems.messages.map((message) => <li key={message}>{message}</li>)}</ul>
        </Notice>
      ) : null}

      <AiContext
        reports={aiReports}
        assessment={value.assessment}
        onCite={(report) => onChange({ ...value, assessment: appendCitation(value.assessment, citationOf(report)) })}
      />

      <section className="surface-section p-5 sm:p-6" aria-labelledby="consultation-reason">
        <h2 id="consultation-reason" className="mb-4 text-sm font-semibold text-[var(--ink)]">Motif et histoire de la maladie</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {text("chiefComplaint", "Motif")}
          {text("historyPresentIllness", "Histoire de la maladie")}
        </div>
      </section>

      <section className="surface-section p-5 sm:p-6" aria-labelledby="consultation-vitals">
        <h2 id="consultation-vitals" className="text-sm font-semibold text-[var(--ink)]">Constantes</h2>
        <p className="mb-4 mt-1 text-xs text-[var(--ink-faint)]">Laissez vide ce qui n’a pas été mesuré. Les seuils d’alerte sont indicatifs (adulte).</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {VITAL_FIELDS.map((field) => {
            const error = errors[field.key];
            return (
              <div key={field.key} className="min-w-0">
                <label className="block min-w-0">
                  <span className="mb-1.5 block text-[0.7rem] font-semibold text-[var(--ink-soft)]">{field.label}</span>
                  <span className="relative block">
                    <input
                      className={cn(inputClass, "pe-14", error && "border-[var(--danger)]")}
                      inputMode={field.integer ? "numeric" : "decimal"}
                      value={value.vitals[field.key]}
                      aria-invalid={error ? true : undefined}
                      aria-describedby={error ? `vital-${field.key}-error` : undefined}
                      autoComplete="off"
                      onChange={(event) => setVital(field.key, event.target.value)}
                    />
                    <span aria-hidden="true" className="pointer-events-none absolute end-3 top-3 text-xs text-[var(--ink-faint)]">{field.unit}</span>
                  </span>
                </label>
                {error ? <p id={`vital-${field.key}-error`} role="alert" className="mt-1 text-xs text-[var(--danger-ink)]">{error}</p> : null}
              </div>
            );
          })}
        </div>
        <dl className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-[var(--line)] pt-4">
          <div className="flex items-baseline gap-2">
            <dt className="text-xs font-semibold text-[var(--ink-soft)]">IMC</dt>
            <dd className="clinical-figure text-sm font-semibold text-[var(--ink)]" data-bmi="">
              {index !== null ? `${formatBmi(index)} kg/m²` : "—"}
            </dd>
          </div>
        </dl>
        {Object.keys(flags).length ? (
          <ul aria-label="Valeurs à surveiller" className="mt-3 space-y-2">
            {(Object.keys(flags) as FlagKey[]).map((key) => <Flag key={key} flag={flags[key]!} detail={flagDetail(key)} />)}
          </ul>
        ) : null}
      </section>

      <section className="surface-section p-5 sm:p-6" aria-labelledby="consultation-exam">
        <h2 id="consultation-exam" className="mb-4 text-sm font-semibold text-[var(--ink)]">Examen clinique</h2>
        {text("clinicalExamination", "Examen clinique")}
      </section>

      <section className="surface-section p-5 sm:p-6" aria-labelledby="consultation-diagnoses">
        <h2 id="consultation-diagnoses" className="mb-4 text-sm font-semibold text-[var(--ink)]">Évaluation et diagnostics</h2>
        {text("assessment", "Évaluation")}
        <div className="mt-5">
          <p className="mb-2 text-[0.7rem] font-semibold text-[var(--ink-soft)]">Diagnostics</p>
          {value.diagnoses.length ? (
            <ul className="space-y-3" data-diagnoses="">
              {value.diagnoses.map((diagnosis, position) => (
                <li key={diagnosis.key} className="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_10rem_auto_auto]" data-primary={diagnosis.isPrimary ? "" : undefined}>
                  <Field label={`Diagnostic ${position + 1}`}>
                    <input
                      className={inputClass}
                      value={diagnosis.label}
                      maxLength={500}
                      placeholder="Libellé libre"
                      onChange={(event) =>
                        onChange({ ...value, diagnosesTouched: true, diagnoses: value.diagnoses.map((item) => (item.key === diagnosis.key ? { ...item, label: event.target.value } : item)) })
                      }
                    />
                  </Field>
                  <Field label={`Code CIM-10 ${position + 1} (facultatif)`}>
                    <input
                      className={inputClass}
                      value={diagnosis.code}
                      maxLength={80}
                      onChange={(event) =>
                        onChange({ ...value, diagnosesTouched: true, diagnoses: value.diagnoses.map((item) => (item.key === diagnosis.key ? { ...item, code: event.target.value } : item)) })
                      }
                    />
                  </Field>
                  <label className="flex h-11 items-center gap-2 text-xs font-medium text-[var(--ink)]">
                    <input
                      type="radio"
                      name="primary-diagnosis"
                      checked={diagnosis.isPrimary}
                      aria-label={`Diagnostic principal : ${diagnosis.label || `diagnostic ${position + 1}`}`}
                      onChange={() => onChange({ ...value, diagnosesTouched: true, diagnoses: setPrimaryDiagnosis(value.diagnoses, diagnosis.key) })}
                    />
                    {diagnosis.isPrimary ? "Principal" : "Secondaire"}
                  </label>
                  <button
                    type="button"
                    className="clinical-icon-button"
                    aria-label={`Supprimer le diagnostic ${position + 1}`}
                    title="Supprimer le diagnostic"
                    onClick={() => onChange({ ...value, diagnosesTouched: true, diagnoses: removeDiagnosis(value.diagnoses, diagnosis.key) })}
                  >
                    <Trash2 size={16} strokeWidth={1.8} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-[var(--ink-faint)]">Aucun diagnostic saisi.</p>
          )}
          <Button
            className="mt-3"
            variant="outline"
            size="sm"
            disabled={value.diagnoses.length >= MAX_DIAGNOSES}
            onClick={() => onChange({ ...value, diagnosesTouched: true, diagnoses: addDiagnosis(value.diagnoses) })}
          >
            <Plus className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
            Ajouter un diagnostic
          </Button>
        </div>
      </section>

      <section className="surface-section p-5 sm:p-6" aria-labelledby="consultation-plan">
        <h2 id="consultation-plan" className="mb-4 text-sm font-semibold text-[var(--ink)]">Conduite à tenir et suivi</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {text("carePlan", "Plan thérapeutique")}
          {text("followUpPlan", "Suivi")}
        </div>
      </section>

      <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--panel)] px-4 py-3 shadow-sm">
        <SaveIndicator state={saveState} />
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Fermer</Button>
          {/* Never disabled while a save runs: a click right after leaving a field must not be lost (saves are queued). */}
          <Button variant="secondary" onClick={onSave}>
            {busy ? "Enregistrement…" : "Enregistrer localement"}
          </Button>
          <Button disabled={!readyToFinish} title={readyToFinish ? undefined : "Renseignez un motif, un examen, une évaluation ou un diagnostic"} onClick={onFinish}>
            Terminer la consultation
          </Button>
        </div>
      </div>
    </section>
  );
}
