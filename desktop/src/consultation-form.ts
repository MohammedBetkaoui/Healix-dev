import { emptyVitalsForm, vitalsFromForm, vitalsToForm, type VitalErrors, type VitalsForm } from "./vitals";
import type { ConsultationDetail, ConsultationDiagnosis, ConsultationDraftInput } from "./types";

// The form of a consultation: what the doctor types, kept as typed (strings for
// the numbers) until it is sent to the native side.
export type DiagnosisForm = {
  key: string;
  label: string;
  code: string;
  codeSystem: string;
  note: string;
  isPrimary: boolean;
};

export type ConsultationForm = {
  localId?: string;
  patientId: string;
  appointmentId?: string | null;
  localStatus: ConsultationDraftInput["localStatus"];
  chiefComplaint: string;
  historyPresentIllness: string;
  clinicalExamination: string;
  assessment: string;
  carePlan: string;
  followUpPlan: string;
  vitals: VitalsForm;
  diagnoses: DiagnosisForm[];
  // Only what the doctor touched is sent: the rest is kept as stored (a value
  // from the server is never replaced by an empty one by accident).
  vitalsTouched: boolean;
  diagnosesTouched: boolean;
};

export const MAX_DIAGNOSES = 20;
export const DEFAULT_CODE_SYSTEM = "CIM-10";

let counter = 0;
const nextKey = () => `dx-${Date.now().toString(36)}-${(counter += 1)}`;

export const newForm = (patientId: string, options: { reason?: string; appointmentId?: string | null } = {}): ConsultationForm => ({
  patientId,
  appointmentId: options.appointmentId ?? null,
  localStatus: "LOCAL_DRAFT",
  chiefComplaint: options.reason ?? "",
  historyPresentIllness: "",
  clinicalExamination: "",
  assessment: "",
  carePlan: "",
  followUpPlan: "",
  vitals: emptyVitalsForm(),
  diagnoses: [],
  vitalsTouched: false,
  diagnosesTouched: false,
});

const DRAFT_STATUSES: ConsultationForm["localStatus"][] = ["LOCAL_DRAFT", "IN_PROGRESS", "READY_TO_SYNC"];

const diagnosisToForm = (diagnosis: ConsultationDiagnosis): DiagnosisForm => ({
  key: nextKey(),
  label: diagnosis.label,
  code: diagnosis.code ?? "",
  codeSystem: diagnosis.codeSystem ?? "",
  note: diagnosis.note ?? "",
  isPrimary: Boolean(diagnosis.isPrimary),
});

// The editor's starting value for a consultation already on the device.
export function formFromDetail(detail: ConsultationDetail): ConsultationForm {
  return {
    localId: detail.localId,
    patientId: detail.patientId,
    appointmentId: detail.appointmentId,
    localStatus: DRAFT_STATUSES.includes(detail.localStatus as ConsultationForm["localStatus"])
      ? (detail.localStatus as ConsultationForm["localStatus"])
      : "LOCAL_DRAFT",
    chiefComplaint: detail.chiefComplaint,
    historyPresentIllness: detail.historyPresentIllness,
    clinicalExamination: detail.clinicalExamination,
    assessment: detail.assessment,
    carePlan: detail.carePlan,
    followUpPlan: detail.followUpPlan,
    vitals: vitalsToForm(detail.vitalSigns),
    diagnoses: detail.diagnoses.map(diagnosisToForm),
    vitalsTouched: false,
    diagnosesTouched: false,
  };
}

export function addDiagnosis(diagnoses: DiagnosisForm[]): DiagnosisForm[] {
  if (diagnoses.length >= MAX_DIAGNOSES) return diagnoses;
  // The first diagnosis is the main one until the doctor says otherwise.
  return [...diagnoses, { key: nextKey(), label: "", code: "", codeSystem: "", note: "", isPrimary: diagnoses.length === 0 }];
}

// A single main diagnosis: designating one releases the previous one.
export const setPrimaryDiagnosis = (diagnoses: DiagnosisForm[], key: string): DiagnosisForm[] =>
  diagnoses.map((diagnosis) => ({ ...diagnosis, isPrimary: diagnosis.key === key }));

export function removeDiagnosis(diagnoses: DiagnosisForm[], key: string): DiagnosisForm[] {
  const rest = diagnoses.filter((diagnosis) => diagnosis.key !== key);
  // Removing the main one hands the role to the first that remains.
  return rest.length && !rest.some((diagnosis) => diagnosis.isPrimary)
    ? rest.map((diagnosis, index) => ({ ...diagnosis, isPrimary: index === 0 }))
    : rest;
}

// What the server asks of a finished consultation: a reason, an examination, an
// assessment or a diagnosis (the history, the plan and the vitals alone do not do).
export function hasClinicalContent(form: ConsultationForm): boolean {
  return (
    Boolean(form.chiefComplaint.trim() || form.clinicalExamination.trim() || form.assessment.trim()) ||
    form.diagnoses.some((diagnosis) => diagnosis.label.trim())
  );
}

export type FormProblems = { vitals: VitalErrors; messages: string[] };

// The request for the native side, or the problems that stop it. Untouched
// vital signs and diagnoses are left out of the request. `lenient` (automatic
// saves, leaving the page): a vital sign still being typed that is not valid
// does not stop the rest from being saved; the vital signs are then left out.
export function inputFromForm(
  form: ConsultationForm,
  status: ConsultationForm["localStatus"] = form.localStatus,
  options: { lenient?: boolean } = {},
): { input: ConsultationDraftInput } | { problems: FormProblems } {
  const messages: string[] = [];
  let vitalErrors: VitalErrors = {};
  const input: ConsultationDraftInput = {
    localId: form.localId,
    patientId: form.patientId,
    localStatus: status,
    chiefComplaint: form.chiefComplaint,
    historyPresentIllness: form.historyPresentIllness,
    clinicalExamination: form.clinicalExamination,
    assessment: form.assessment,
    carePlan: form.carePlan,
    followUpPlan: form.followUpPlan,
  };
  if (form.appointmentId) input.appointmentId = form.appointmentId;

  if (form.vitalsTouched) {
    const { values, errors } = vitalsFromForm(form.vitals);
    if (!Object.keys(errors).length) {
      input.vitalSigns = values;
    } else if (!options.lenient) {
      vitalErrors = errors;
      messages.push(...Object.values(errors));
    }
  }
  if (form.diagnosesTouched) {
    const filled = form.diagnoses.filter((diagnosis) => diagnosis.label.trim());
    input.diagnoses = filled.map((diagnosis) => {
      const code = diagnosis.code.trim();
      return {
        label: diagnosis.label.trim(),
        code: code || null,
        codeSystem: code ? diagnosis.codeSystem.trim() || DEFAULT_CODE_SYSTEM : null,
        isPrimary: diagnosis.isPrimary,
        note: diagnosis.note.trim() || null,
      };
    });
  }
  if (status === "READY_TO_SYNC" && !hasClinicalContent(form)) {
    messages.push("Pour terminer la consultation, renseignez au moins un motif, un examen clinique, une évaluation ou un diagnostic.");
  }
  return messages.length ? { problems: { vitals: vitalErrors, messages } } : { input };
}
