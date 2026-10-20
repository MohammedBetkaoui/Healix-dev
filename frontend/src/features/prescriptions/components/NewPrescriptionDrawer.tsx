import { FileCheck2, Save, Search, ShieldAlert, X } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { type Locale } from "@/i18n";
import { type TranslationFunction } from "@/lib/i18n";

import { localize } from "../prescriptions.copy";
import {
  type ClinicalSafetyAlert,
  type Medication,
  type Practitioner,
  type Prescription,
  type PrescriptionCapabilities,
  type PrescriptionEncounter,
  type PrescriptionItem,
  type PrescriptionPatient,
  type PrescriptionType,
} from "../types/prescription.types";
import { getPatientDisplayName } from "../utils/prescription-format";
import { ClinicalSafetyPanel } from "./ClinicalSafetyPanel";
import { InsuranceContext } from "./InsuranceContext";
import { MedicationComposer } from "./MedicationComposer";
import { PatientContextCard } from "./PatientContextCard";
import { PrescriptionPreview } from "./PrescriptionPreview";
import { PrescriptionReview } from "./PrescriptionReview";

type NewPrescriptionDrawerProps = {
  capabilities: PrescriptionCapabilities;
  encounters: PrescriptionEncounter[];
  locale: Locale;
  medications: Medication[];
  onClose: () => void;
  onSave: (prescription: Prescription) => void;
  onValidate: (prescription: Prescription) => void;
  patients: PrescriptionPatient[];
  prescriber: Practitioner;
  source?: Prescription;
  t: TranslationFunction;
};

function blankItem(medication: Medication): PrescriptionItem {
  return {
    id: `draft-${medication.id}-${Date.now()}`,
    medication,
    dosePerIntake: { fr: "1 comprimé", ar: "قرص واحد" },
    frequency: { fr: "1 fois par jour", ar: "مرة واحدة يومياً" },
    intakeMoment: { fr: "Le matin", ar: "صباحاً" },
    durationDays: 7,
    quantity: { fr: "7 unités", ar: "7 وحدات" },
    patientInstructions: { fr: "Respecter la posologie indiquée.", ar: "احترام الجرعة المحددة." },
    indication: { fr: "À préciser", ar: "يحدد لاحقاً" },
    asNeeded: false,
    renewalAllowed: false,
    substitutionAllowed: true,
  };
}

function typeFromItems(items: PrescriptionItem[]): PrescriptionType {
  const categories = items.map((item) => item.medication.regulatoryCategory);
  if (categories.includes("NARCOTIC")) return "NARCOTIC";
  if (categories.includes("PSYCHOTROPIC")) return "PSYCHOTROPIC";
  if (categories.includes("REGULATED")) return "REGULATED";
  return "STANDARD";
}

function buildAlerts(patient: PrescriptionPatient, items: PrescriptionItem[]): ClinicalSafetyAlert[] {
  const alerts: ClinicalSafetyAlert[] = [];
  const hasPenicillinAllergy = patient.allergies?.some((allergy) => allergy.fr.toLocaleLowerCase().includes("pénicill"));
  const hasAmoxicillin = items.some((item) => item.medication.id === "med-amoxicillin");
  if (hasPenicillinAllergy && hasAmoxicillin) {
    alerts.push({ id: "draft-allergy", kind: "ALLERGY", level: "critical", title: { fr: "Allergie potentielle", ar: "حساسية محتملة" }, detail: { fr: "Allergie aux pénicillines documentée dans le dossier.", ar: "حساسية تجاه البنسلين موثقة في الملف." }, resolved: false });
  } else {
    alerts.push({ id: "draft-allergy-clear", kind: "ALLERGY_CLEAR", level: "information", title: { fr: "Allergies : aucune correspondance connue", ar: "الحساسية: لا توجد مطابقة معروفة" }, resolved: true });
  }
  if (new Set(items.map((item) => item.medication.id)).size !== items.length) alerts.push({ id: "draft-duplication", kind: "DUPLICATION", level: "attention", title: { fr: "Duplication thérapeutique à vérifier", ar: "يجب التحقق من التكرار العلاجي" }, resolved: false });
  if (items.some((item) => item.durationDays > 90)) alerts.push({ id: "draft-duration", kind: "DURATION", level: "attention", title: { fr: "Durée inhabituelle à vérifier", ar: "يجب التحقق من مدة علاج غير معتادة" }, resolved: false });
  if (items.some((item) => item.medication.requiresPriorApproval === "YES")) alerts.push({ id: "draft-approval", kind: "HIGH_RISK", level: "attention", title: { fr: "Accord préalable requis", ar: "الموافقة المسبقة مطلوبة" }, detail: { fr: "Le statut doit être confirmé par une source autorisée.", ar: "يجب تأكيد الحالة من مصدر مخول." }, resolved: false });
  if (items.some((item) => ["PSYCHOTROPIC", "NARCOTIC"].includes(item.medication.regulatoryCategory))) alerts.push({ id: "draft-regulated", kind: "REGULATED", level: "attention", title: { fr: "Psychotrope / stupéfiant — exigences à vérifier", ar: "دواء نفساني / مخدر — متطلبات يجب التحقق منها" }, resolved: false });
  return alerts;
}

function cloneItems(source: Prescription | undefined, medications: Medication[]) {
  if (!source) return [blankItem(medications.find((medication) => medication.id === "med-paracetamol") ?? medications[0])];
  return source.items.map((item, index) => ({ ...item, id: `renewal-${Date.now()}-${index}`, medication: { ...item.medication }, patientInstructions: { ...item.patientInstructions }, indication: { ...item.indication } }));
}

export function NewPrescriptionDrawer({ capabilities, encounters, locale, medications, onClose, onSave, onValidate, patients, prescriber, source, t }: NewPrescriptionDrawerProps) {
  const draftSeed = useId().replaceAll(":", "");
  const initialPatient = source?.patient ?? patients[0];
  const [patientId, setPatientId] = useState(initialPatient.id);
  const [patientQuery, setPatientQuery] = useState(() => getPatientDisplayName(initialPatient, locale));
  const [encounterId, setEncounterId] = useState(source?.encounter?.id ?? "");
  const [items, setItems] = useState<PrescriptionItem[]>(() => cloneItems(source, medications));
  const [previewOpen, setPreviewOpen] = useState(false);
  const patient = patients.find((candidate) => candidate.id === patientId) ?? patients[0];
  const alerts = useMemo(() => buildAlerts(patient, items), [items, patient]);
  const type = typeFromItems(items);
  const listId = `patient-list-${source?.id ?? "new"}`;

  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [onClose]);

  const createPrescription = (status: "DRAFT" | "VALIDATED"): Prescription => {
    const now = "2026-10-19T11:42:00+01:00";
    const suffix = source ? "004290" : "004289";
    return {
      id: `rx-${suffix}-${draftSeed}`,
      number: `ORD-2026-${suffix}`,
      patient,
      prescriber,
      encounter: encounters.find((encounter) => encounter.id === encounterId),
      prescribedAt: now,
      status,
      type,
      items,
      alerts,
      basedOnPrescriptionNumber: source?.number,
      validatedAt: status === "VALIDATED" ? now : undefined,
      regulatoryDetails: type === "STANDARD" ? undefined : { supportRequired: true, validityLabel: { fr: "Conditions réglementaires à confirmer", ar: "يجب تأكيد الشروط التنظيمية" }, ordinalRegistration: prescriber.registrationNumber, signatureRecorded: status === "VALIDATED" },
      auditTrail: [
        { id: `created-${draftSeed}`, at: now, actor: `Dr. ${prescriber.firstName} ${prescriber.lastName}`, label: { fr: source ? `Renouvellement préparé depuis ${source.number}` : "Ordonnance créée", ar: source ? `تم تحضير التجديد انطلاقاً من ${source.number}` : "تم إنشاء الوصفة" } },
        ...(status === "VALIDATED" ? [{ id: `validated-${draftSeed}`, at: now, actor: `Dr. ${prescriber.firstName} ${prescriber.lastName}`, label: { fr: `Ordonnance validée par Dr. ${prescriber.firstName} ${prescriber.lastName}`, ar: `تم اعتماد الوصفة من طرف د. ${prescriber.firstName} ${prescriber.lastName}` } }] : []),
      ],
    };
  };

  const draftPrescription = createPrescription("DRAFT");
  const isRegulated = type !== "STANDARD";
  return (
    <>
      <div className="fixed inset-0 z-50 bg-[var(--scrim)]" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
        <section className="absolute inset-y-0 end-0 flex w-full max-w-[1500px] flex-col overflow-hidden border-s border-[var(--border)] bg-[var(--bg)] text-[var(--text-primary)] shadow-[var(--shadow-raised)]" role="dialog" aria-modal="true" aria-labelledby="new-prescription-title">
          <header className="flex items-start justify-between gap-4 border-b border-[var(--border)] bg-[var(--surface)] px-4 py-4 sm:px-6">
            <div><p className="text-[.68rem] font-medium text-[var(--medical)]">{t("prescriptions.page.context")}</p><h2 id="new-prescription-title" className="mt-1 text-lg font-semibold">{t("prescriptions.builder.title")}</h2><p className="mt-1 text-[.72rem] text-[var(--text-secondary)]">{t("prescriptions.builder.subtitle")}</p>{source ? <p className="mt-2 inline-flex rounded-full border border-[var(--accent-line)] bg-[var(--accent-soft)] px-2.5 py-1 text-[.68rem] font-semibold text-[var(--accent-dark)]">{t("prescriptions.common.basedOn")} <bdi dir="ltr" className="ms-1">{source.number}</bdi></p> : null}</div>
            <button type="button" className="clinical-icon-button shrink-0" onClick={onClose} aria-label={t("prescriptions.actions.close")}><X size={20} aria-hidden="true" /></button>
          </header>

          <div className="flex-1 overflow-y-auto p-4 pb-24 sm:p-6 lg:pb-6">
            {isRegulated ? <div className="mb-4 flex items-start gap-3 rounded-[var(--radius-md)] border border-[var(--warning-line)] bg-[var(--warning-soft)] p-4 text-[var(--warning-ink)]"><ShieldAlert size={18} className="mt-0.5 shrink-0" aria-hidden="true" /><div><p className="text-sm font-semibold">{t("prescriptions.regulated.title")}</p><p className="mt-1 text-[.72rem]">{type === "NARCOTIC" ? t("prescriptions.regulated.narcotic") : t("prescriptions.regulated.psychotropic")}</p><p className="mt-1 text-[.68rem] font-semibold">{t("prescriptions.regulated.support")}</p><p className="mt-1 text-[.66rem]">{t("prescriptions.regulated.notOfficialBook")}</p></div></div> : null}
            <div className="grid items-start gap-5 lg:grid-cols-[minmax(280px,.82fr)_minmax(420px,1.45fr)_minmax(280px,.82fr)]">
              <section className="space-y-4">
                <h3 className="text-sm font-semibold">{t("prescriptions.builder.areas.patient")}</h3>
                <label className="block"><span className="mb-1.5 block text-[.68rem] font-medium text-[var(--text-secondary)]">{t("prescriptions.builder.searchPatient")}</span><span className="relative block"><Search className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" size={15} aria-hidden="true" /><Input className="h-10 rounded-[var(--radius-sm)] ps-9 text-[.76rem] shadow-none" list={listId} value={patientQuery} onBlur={() => setPatientQuery(getPatientDisplayName(patient, locale))} onChange={(event) => { const value = event.target.value; setPatientQuery(value); const match = patients.find((candidate) => getPatientDisplayName(candidate, locale) === value); if (match) setPatientId(match.id); }} /></span><datalist id={listId}>{patients.map((candidate) => <option key={candidate.id} value={getPatientDisplayName(candidate, locale)} />)}</datalist></label>
                <label className="block"><span className="mb-1.5 block text-[.68rem] font-medium text-[var(--text-secondary)]">{t("prescriptions.builder.associatedConsultation")}</span><Select className="h-10 rounded-[var(--radius-sm)] text-[.76rem] shadow-none" value={encounterId} onChange={(event) => setEncounterId(event.target.value)}><option value="">{t("prescriptions.builder.noEncounter")}</option>{encounters.map((encounter) => <option key={encounter.id} value={encounter.id}>{localize(encounter.label, locale)}</option>)}</Select></label>
                <PatientContextCard locale={locale} patient={patient} t={t} />
                <InsuranceContext medications={items.map((item) => item.medication)} patient={patient} t={t} />
              </section>
              <MedicationComposer items={items} locale={locale} medications={medications} onChange={setItems} t={t} />
              <section className="space-y-4 lg:sticky lg:top-0"><h3 className="text-sm font-semibold">{t("prescriptions.builder.areas.review")}</h3><ClinicalSafetyPanel alerts={alerts} locale={locale} t={t} /><PrescriptionReview alerts={alerts} capabilities={capabilities} items={items} locale={locale} onPreview={() => setPreviewOpen(true)} onSave={() => onSave(createPrescription("DRAFT"))} onValidate={() => onValidate(createPrescription("VALIDATED"))} patient={patient} prescriber={prescriber} t={t} /></section>
            </div>
          </div>

          <footer className="absolute inset-x-0 bottom-0 flex gap-2 border-t border-[var(--border)] bg-[var(--surface)] p-3 lg:hidden"><button type="button" className="clinical-button min-w-0 flex-1" onClick={() => onSave(createPrescription("DRAFT"))}><Save size={15} aria-hidden="true" />{t("prescriptions.actions.saveDraft")}</button><button type="button" className="clinical-button clinical-button-primary min-w-0 flex-1" disabled={!capabilities.canSignPrescription || items.length === 0} onClick={() => onValidate(createPrescription("VALIDATED"))}><FileCheck2 size={15} aria-hidden="true" />{t("prescriptions.actions.validate")}</button></footer>
        </section>
      </div>
      {previewOpen ? <PrescriptionPreview locale={locale} onClose={() => setPreviewOpen(false)} onPrint={() => window.print()} prescription={draftPrescription} t={t} /> : null}
    </>
  );
}

