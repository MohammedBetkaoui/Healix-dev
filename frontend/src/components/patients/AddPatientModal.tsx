"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowUpRight, FileWarning, ShieldCheck, UserPlus, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { useCreatePatient } from "@/features/patients/hooks/use-create-patient";
import {
  formatAlgerianPhone,
  formatPatientDate,
  maskPatientName,
  type PotentialPatientDuplicate,
} from "@/features/patients/patient-registry";
import { checkPatientDuplicate } from "@/features/patients/patients.api";
import { type CreatePatientPayload } from "@/features/patients/patients.types";
import { type Locale } from "@/i18n";
import { type Direction, type TranslationFunction } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  type Patient,
  type PatientFormValues,
  type PatientGender,
  type PatientInsurance,
  type PatientSector,
} from "@/types/patient";

import { PatientFormFields } from "./PatientFormFields";
import { createPatientFormSchema, getPatientFormValues } from "./patient-form";

type AddPatientModalProps = {
  direction: Direction;
  isOpen: boolean;
  locale: Locale;
  onClose: () => void;
  onCreate: () => void;
  onOpenPatient: (patient: Patient) => void;
  t: TranslationFunction;
};

function buildCreatePayload(
  values: PatientFormValues,
  duplicateOverrideReason?: string,
): CreatePatientPayload {
  const [, wilayaName] = values.wilaya.split("|");

  return {
    address: values.address,
    birthDate: values.birthDate,
    commune: values.commune,
    duplicateOverrideReason,
    email: values.email || undefined,
    emergencyContactName: values.emergencyContactName,
    emergencyContactPhone: values.emergencyContactPhone.replace(/\D/g, ""),
    firstName: values.firstName,
    firstNameAr: values.firstNameAr,
    gender: values.gender as PatientGender,
    hospitalRecordNumber: values.hospitalRecordNumber || undefined,
    insurance: values.insurance as PatientInsurance,
    insuredNumber: values.insuredNumber || undefined,
    lastName: values.lastName,
    lastNameAr: values.lastNameAr,
    nationalId: values.nationalId,
    phone: values.phone.replace(/\D/g, ""),
    sector: values.sector as PatientSector,
    smsEnabled: values.smsEnabled,
    wilaya: wilayaName ?? values.wilaya,
  };
}

export function AddPatientModal({
  direction,
  isOpen,
  locale,
  onClose,
  onCreate,
  onOpenPatient,
  t,
}: AddPatientModalProps) {
  const schema = useMemo(() => createPatientFormSchema(t), [t]);
  const createPatientMutation = useCreatePatient();
  const [duplicate, setDuplicate] = useState<PotentialPatientDuplicate>();
  const [pendingValues, setPendingValues] = useState<PatientFormValues>();
  const [justification, setJustification] = useState("");
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    reset,
    watch,
  } = useForm<PatientFormValues>({
    defaultValues: getPatientFormValues(),
    resolver: zodResolver(schema),
  });

  const closeModal = () => {
    reset(getPatientFormValues());
    setDuplicate(undefined);
    setPendingValues(undefined);
    setJustification("");
    createPatientMutation.reset();
    onClose();
  };

  if (!isOpen) return null;

  const createPatient = (values: PatientFormValues, overrideReason?: string) => {
    createPatientMutation.mutate(buildCreatePayload(values, overrideReason), {
      onSuccess: () => {
        onCreate();
        closeModal();
      },
    });
  };

  const submit = async (values: PatientFormValues) => {
    try {
      const [match] = await checkPatientDuplicate({
        birthDate: values.birthDate,
        firstName: values.firstName,
        firstNameAr: values.firstNameAr,
        lastName: values.lastName,
        lastNameAr: values.lastNameAr,
        nationalId: values.nationalId,
        phone: values.phone,
      });
      if (match) {
        setDuplicate(match);
        setPendingValues(values);
        return;
      }
    } catch {
      // The duplicate check is a UX safeguard, not a hard gate — if it fails
      // (network, auth refresh, …), fall through and let creation proceed.
    }
    createPatient(values);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0f172a]/50 p-3 backdrop-blur-[2px] sm:p-6" role="presentation">
      <div
        aria-labelledby="add-patient-title"
        aria-modal="true"
        className={cn(
          "max-h-[94vh] w-full max-w-5xl overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)] shadow-sm",
          direction === "rtl" && "text-right",
        )}
        dir={direction}
        role="dialog"
      >
        <header className="flex items-start justify-between gap-5 border-b border-[var(--line)] px-5 py-5 sm:px-7">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[0.78rem] border border-[var(--accent-line)] bg-[var(--accent-soft)] text-[var(--accent-dark)]">
              <UserPlus className="h-5 w-5" strokeWidth={1.7} aria-hidden="true" />
            </span>
            <div>
              <p className="font-[var(--font-auth-mono)] text-[0.65rem] uppercase tracking-[0.13em] text-[var(--accent)]">{t("patients.modal.kicker")}</p>
              <h2 id="add-patient-title" className="mt-1 font-[var(--font-auth-display)] text-2xl font-medium text-[var(--ink)]">{t("patients.modal.addTitle")}</h2>
              <p className="mt-1 text-sm text-[var(--ink-soft)]">{t("patients.modal.addSubtitle")}</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="shrink-0 rounded-full text-[var(--ink-faint)]" onClick={closeModal} aria-label={t("patients.actions.close")}>
            <X className="h-4 w-4" strokeWidth={1.7} />
          </Button>
        </header>

        <form className="max-h-[calc(94vh-110px)] overflow-y-auto px-5 py-6 sm:px-7" onSubmit={handleSubmit(submit)}>
          <PatientFormFields direction={direction} errors={errors} register={register} t={t} watch={watch} />
          {createPatientMutation.isError ? (
            <p className="mt-4 font-[var(--font-auth-mono)] text-[0.7rem] text-[var(--danger-ink)]">{t("patients.states.submitError")}</p>
          ) : null}
          <footer className="mt-8 flex flex-col-reverse gap-3 border-t border-[var(--line)] pt-5 sm:flex-row sm:justify-end">
            <Button className="rounded-full border-[var(--line)] bg-transparent px-5 text-[var(--ink-soft)]" type="button" variant="outline" onClick={closeModal}>{t("patients.actions.cancel")}</Button>
            <Button className="rounded-full px-6" type="submit" disabled={isSubmitting || createPatientMutation.isPending}>
              <ShieldCheck className="me-2 h-4 w-4" strokeWidth={1.7} aria-hidden="true" />
              {t("patients.actions.createRegistry")}
            </Button>
          </footer>
        </form>
      </div>

      {duplicate && pendingValues ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#0f172a]/60 p-4" role="presentation">
          <section aria-labelledby="duplicate-title" aria-modal="true" className="w-full max-w-xl rounded-xl border border-[var(--accent-line)] bg-[var(--panel)] p-6 shadow-sm" dir={direction} role="alertdialog">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[0.78rem] border border-[var(--accent-line)] bg-[var(--accent-soft)] text-[var(--accent)]">
                <FileWarning className="h-5 w-5" strokeWidth={1.7} aria-hidden="true" />
              </span>
              <div>
                <p className="font-[var(--font-auth-mono)] text-[0.64rem] uppercase tracking-[0.12em] text-[var(--accent)]">{t("patients.duplicate.kicker")}</p>
                <h3 id="duplicate-title" className="mt-1 font-[var(--font-auth-display)] text-2xl font-medium text-[var(--ink)]">{t("patients.duplicate.title")}</h3>
                <p className="mt-2 text-sm leading-6 text-[var(--ink-soft)]">{t("patients.duplicate.description")}</p>
              </div>
            </div>

            <div className="my-5 rounded-[0.9rem] border border-[var(--line)] bg-muted p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-[var(--ink)]">{maskPatientName(duplicate.patient, locale)}</p>
                  <p className="mt-1 font-[var(--font-auth-mono)] text-[0.68rem] text-[var(--ink-faint)]">{duplicate.patient.id}</p>
                </div>
                <span className="rounded-full border border-[var(--accent-line)] bg-[var(--accent-soft)] px-3 py-1 font-[var(--font-auth-mono)] text-[0.62rem] text-[var(--accent)]">{t("patients.duplicate.match")}</span>
              </div>
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <div><dt className="text-xs text-[var(--ink-faint)]">{t("patients.table.columns.birthDate")}</dt><dd className="mt-1 text-[var(--ink-soft)]">{formatPatientDate(duplicate.patient.birthDate, locale)}</dd></div>
                <div><dt className="text-xs text-[var(--ink-faint)]">{t("patients.table.columns.phone")}</dt><dd className="mt-1 text-[var(--ink-soft)]">{formatAlgerianPhone(duplicate.patient.phone)}</dd></div>
              </dl>
            </div>

            <label className="block text-sm font-medium text-[var(--ink)]" htmlFor="duplicate-justification">{t("patients.duplicate.justification")}</label>
            <textarea id="duplicate-justification" className="mt-2 min-h-24 w-full rounded-[0.75rem] border border-[var(--line)] bg-muted p-3 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]" value={justification} onChange={(event) => setJustification(event.target.value)} placeholder={t("patients.duplicate.justificationPlaceholder")} />
            <p className="mt-1 text-xs text-[var(--ink-faint)]">{t("patients.duplicate.auditNote")}</p>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" className="rounded-full border-[var(--accent-line)] text-[var(--accent-dark)]" onClick={() => onOpenPatient(duplicate.patient)}>
                {t("patients.duplicate.openRecord")}<ArrowUpRight className="ms-2 h-4 w-4" strokeWidth={1.7} />
              </Button>
              <Button type="button" className="rounded-full bg-primary px-5 text-white hover:bg-secondary" disabled={justification.trim().length < 10 || createPatientMutation.isPending} onClick={() => createPatient(pendingValues)}>{t("patients.duplicate.createAnyway")}</Button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
