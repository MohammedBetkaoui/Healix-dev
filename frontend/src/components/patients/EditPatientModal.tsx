"use client";

import { useMemo } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Edit3, X } from "lucide-react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { useUpdatePatient } from "@/features/patients/hooks/use-update-patient";
import { type UpdatePatientPayload } from "@/features/patients/patients.types";
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

type EditPatientModalProps = {
  direction: Direction;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: () => void;
  patient: Patient | null;
  t: TranslationFunction;
};

function buildUpdatePayload(values: PatientFormValues): UpdatePatientPayload {
  const [, wilayaName] = values.wilaya.split("|");

  return {
    address: values.address,
    birthDate: values.birthDate,
    commune: values.commune,
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

export function EditPatientModal({
  direction,
  isOpen,
  onClose,
  onUpdate,
  patient,
  t,
}: EditPatientModalProps) {
  const schema = useMemo(() => createPatientFormSchema(t), [t]);
  const updatePatientMutation = useUpdatePatient();
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    watch,
  } = useForm<PatientFormValues>({
    defaultValues: getPatientFormValues(patient ?? undefined),
    resolver: zodResolver(schema),
    values: getPatientFormValues(patient ?? undefined),
  });

  if (!isOpen || !patient) {
    return null;
  }

  const submit = (values: PatientFormValues) => {
    updatePatientMutation.mutate(
      { id: patient.id, payload: buildUpdatePayload(values) },
      {
        onSuccess: () => {
          onUpdate();
          onClose();
        },
      },
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0f172a]/35 p-4 backdrop-blur-sm">
      <div
        className={cn(
          "max-h-[92vh] w-full max-w-4xl overflow-hidden rounded-xl border border-border bg-card shadow-sm",
          direction === "rtl" && "text-right",
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-muted text-[var(--accent-dark)]">
              <Edit3 className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-xl font-semibold text-foreground">
                {t("patients.modal.editTitle")}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("patients.modal.editSubtitle")}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full"
            onClick={onClose}
            aria-label={t("patients.actions.close")}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <form
          className="max-h-[calc(92vh-92px)] overflow-y-auto px-6 py-6"
          onSubmit={handleSubmit(submit)}
        >
          <PatientFormFields
            direction={direction}
            errors={errors}
            register={register}
            t={t}
            watch={watch}
          />
          {updatePatientMutation.isError ? (
            <p className="mt-4 text-xs text-destructive">
              {t("patients.states.submitError")}
            </p>
          ) : null}
          <div className="mt-8 flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={onClose}>
              {t("patients.actions.cancel")}
            </Button>
            <Button type="submit" disabled={isSubmitting || updatePatientMutation.isPending}>
              {t("patients.actions.save")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
