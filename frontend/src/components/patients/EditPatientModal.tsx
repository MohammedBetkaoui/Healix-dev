"use client";

import { useEffect, useMemo } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Edit3, X } from "lucide-react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { type Direction, type TranslationFunction } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { type Patient, type PatientFormValues } from "@/types/patient";

import { PatientFormFields } from "./PatientFormFields";
import {
  createPatientFormSchema,
  createPatientFromForm,
  getPatientFormValues,
} from "./patient-form";

type EditPatientModalProps = {
  direction: Direction;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (patient: Patient) => void;
  patient: Patient | null;
  t: TranslationFunction;
};

export function EditPatientModal({
  direction,
  isOpen,
  onClose,
  onUpdate,
  patient,
  t,
}: EditPatientModalProps) {
  const schema = useMemo(() => createPatientFormSchema(t), [t]);
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    reset,
    watch,
  } = useForm<PatientFormValues>({
    defaultValues: getPatientFormValues(patient ?? undefined),
    resolver: zodResolver(schema),
  });

  useEffect(() => {
    if (isOpen) {
      reset(getPatientFormValues(patient ?? undefined));
    }
  }, [isOpen, patient, reset]);

  if (!isOpen || !patient) {
    return null;
  }

  const submit = (values: PatientFormValues) => {
    onUpdate(createPatientFromForm(values, patient));
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-sm">
      <div
        className={cn(
          "max-h-[92vh] w-full max-w-4xl overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_24px_90px_rgba(15,23,42,0.22)]",
          direction === "rtl" && "text-right",
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-[#0b3b5f]">
              <Edit3 className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-xl font-semibold text-slate-950">
                {t("patients.modal.editTitle")}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
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
          <div className="mt-8 flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={onClose}>
              {t("patients.actions.cancel")}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {t("patients.actions.save")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
