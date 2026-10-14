"use client";

import { ClipboardPlus, X } from "lucide-react";
import { type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { laboratoryCopy } from "@/features/laboratory/laboratory.copy";
import {
  type LabCategory,
  type LabLocalizedText,
  type LabPriority,
  type LabRequest,
} from "@/features/laboratory/laboratory.types";
import { type Locale } from "@/i18n";

const fieldClassName = "h-11 w-full rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--panel)] px-3 text-sm text-[var(--ink)] outline-none transition placeholder:text-[var(--ink-faint)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]";

const categories: LabCategory[] = [
  "HEMATOLOGY",
  "BIOCHEMISTRY",
  "MICROBIOLOGY",
  "IMMUNOLOGY",
  "HORMONOLOGY",
  "PARASITOLOGY",
];

function localized(value: LabLocalizedText, locale: Locale) {
  return value[locale];
}

function dateKey(value: Date) {
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${value.getFullYear()}-${month}-${day}`;
}

type NewLabRequestModalProps = {
  authorName: string;
  locale: Locale;
  onClose: () => void;
  onCreate: (request: LabRequest) => void;
  requests: LabRequest[];
};

export function NewLabRequestModal({ authorName, locale, onClose, onCreate, requests }: NewLabRequestModalProps) {
  const copy = laboratoryCopy[locale];
  const patients = Array.from(new Map(requests.map((request) => [request.patient.internalRecordNumber, request.patient])).values());
  const doctors = Array.from(new Map(requests.map((request) => [request.doctor.fr, request.doctor])).values());
  const services = Array.from(new Map(requests.map((request) => [request.service.fr, request.service])).values());
  const samples = Array.from(new Map(requests.map((request) => [request.sample.type.fr, request.sample.type])).values());

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const patient = patients.find((item) => item.internalRecordNumber === data.get("patient")) ?? patients[0];
    const doctor = doctors.find((item) => item.fr === data.get("doctor")) ?? doctors[0];
    const service = services.find((item) => item.fr === data.get("service")) ?? services[0];
    const sampleType = samples.find((item) => item.fr === data.get("sample")) ?? samples[0];
    if (!patient || !doctor || !service || !sampleType) return;

    const now = new Date().toISOString();
    const requestToken = now.replaceAll(/\D/g, "");
    const requestedExams = String(data.get("exams") || "")
      .split(/[;,]/)
      .map((item) => item.trim())
      .filter(Boolean);

    onCreate({
      category: String(data.get("category")) as LabCategory,
      createdAt: now,
      doctor,
      enteredBy: null,
      exams: requestedExams.map((exam) => ({ ar: exam, fr: exam })),
      id: `lab-local-${requestToken}`,
      labComment: null,
      patient,
      priority: String(data.get("priority")) as LabPriority,
      reference: `LAB-${dateKey(new Date()).replaceAll("-", "").slice(2)}-${requestToken.slice(-4)}`,
      results: [],
      sample: {
        collectedAt: null,
        collectedBy: null,
        conformity: "PENDING",
        conformityComment: null,
        receivedAt: null,
        type: sampleType,
      },
      service,
      status: "PRESCRIBED",
      trace: [
        {
          actor: { ar: authorName, fr: authorName },
          date: now,
          detail: {
            ar: "تم إنشاء طلب تجريبي محلي دون إرسال إلى الخادم.",
            fr: "Demande mock créée localement sans transmission au serveur.",
          },
          id: `trace-${requestToken}`,
          title: { ar: "تم وصف الطلب", fr: "Demande prescrite" },
        },
      ],
      validation: null,
    });
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[var(--scrim)] p-3 sm:p-6"
      role="presentation"
      onKeyDown={(event) => { if (event.key === "Escape") onClose(); }}
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <section className="surface-section surface-raised max-h-[94vh] w-full max-w-2xl overflow-hidden" role="dialog" aria-modal="true" aria-labelledby="new-lab-request-title">
        <header className="flex items-start justify-between gap-4 border-b border-[var(--line)] bg-[var(--panel-soft)] px-5 py-4 sm:px-6">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--medical-soft)] text-[var(--medical)] ring-1 ring-[var(--accent-line)]">
              <ClipboardPlus className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
            </span>
            <div>
              <h2 id="new-lab-request-title" className="text-lg font-semibold text-[var(--ink)]">{copy.modal.title}</h2>
              <p className="mt-1 text-xs leading-5 text-[var(--ink-soft)]">{copy.modal.subtitle}</p>
            </div>
          </div>
          <button autoFocus type="button" className="clinical-icon-button shrink-0" onClick={onClose} aria-label={copy.modal.cancel}>
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>

        <form className="max-h-[calc(94vh-7rem)] overflow-y-auto" onSubmit={submit}>
          <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
            <label className="space-y-1.5 text-xs font-medium text-[var(--ink-soft)] sm:col-span-2">
              <span>{copy.modal.patient}</span>
              <select className={fieldClassName} name="patient" required defaultValue={patients[0]?.internalRecordNumber}>
                {patients.map((patient) => (
                  <option key={patient.internalRecordNumber} value={patient.internalRecordNumber}>
                    {locale === "ar" ? `${patient.firstNameAr} ${patient.lastNameAr}` : `${patient.firstName} ${patient.lastName}`} · {patient.internalRecordNumber}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1.5 text-xs font-medium text-[var(--ink-soft)]">
              <span>{copy.modal.category}</span>
              <select className={fieldClassName} name="category" defaultValue="HEMATOLOGY">
                {categories.map((category) => <option key={category} value={category}>{copy.categories[category]}</option>)}
              </select>
            </label>
            <label className="space-y-1.5 text-xs font-medium text-[var(--ink-soft)]">
              <span>{copy.modal.priority}</span>
              <select className={fieldClassName} name="priority" defaultValue="ROUTINE">
                <option value="ROUTINE">{copy.routine}</option>
                <option value="URGENT">{copy.urgent}</option>
              </select>
            </label>
            <label className="space-y-1.5 text-xs font-medium text-[var(--ink-soft)] sm:col-span-2">
              <span>{copy.modal.exam}</span>
              <input className={fieldClassName} name="exams" placeholder={copy.modal.examPlaceholder} required />
            </label>
            <label className="space-y-1.5 text-xs font-medium text-[var(--ink-soft)]">
              <span>{copy.modal.doctor}</span>
              <select className={fieldClassName} name="doctor" defaultValue={doctors[0]?.fr}>
                {doctors.map((doctor) => <option key={doctor.fr} value={doctor.fr}>{localized(doctor, locale)}</option>)}
              </select>
            </label>
            <label className="space-y-1.5 text-xs font-medium text-[var(--ink-soft)]">
              <span>{copy.modal.service}</span>
              <select className={fieldClassName} name="service" defaultValue={services[0]?.fr}>
                {services.map((service) => <option key={service.fr} value={service.fr}>{localized(service, locale)}</option>)}
              </select>
            </label>
            <label className="space-y-1.5 text-xs font-medium text-[var(--ink-soft)] sm:col-span-2">
              <span>{copy.modal.sample}</span>
              <select className={fieldClassName} name="sample" defaultValue={samples[0]?.fr}>
                {samples.map((sample) => <option key={sample.fr} value={sample.fr}>{localized(sample, locale)}</option>)}
              </select>
            </label>
          </div>

          <footer className="flex flex-col-reverse gap-2 border-t border-[var(--line)] bg-[var(--panel-soft)] px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
            <Button type="button" variant="outline" onClick={onClose}>{copy.modal.cancel}</Button>
            <Button type="submit"><ClipboardPlus className="h-4 w-4" aria-hidden="true" />{copy.modal.create}</Button>
          </footer>
        </form>
      </section>
    </div>
  );
}
