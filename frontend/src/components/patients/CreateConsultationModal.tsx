"use client";

import { ClipboardPlus, TriangleAlert, X } from "lucide-react";
import { useEffect, useId } from "react";
import { useForm } from "react-hook-form";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCreatePatientConsultation } from "@/features/patients/hooks/use-create-patient-consultation";
import { type Locale } from "@/i18n";
import { getServerErrorMessage } from "@/lib/api/get-server-error-message";
import { type Direction } from "@/lib/i18n";

type CreateConsultationModalProps = {
  appointmentId?: string;
  direction: Direction;
  isOpen: boolean;
  locale: Locale;
  onClose: () => void;
  onCreated: () => void;
  patientId: string;
};

type ConsultationFormValues = {
  date: string;
  diagnosis: string;
  reason: string;
  time: string;
  treatment: string;
};

const modalCopy = {
  fr: {
    cancel: "Annuler",
    close: "Fermer",
    create: "Enregistrer la consultation",
    creating: "Enregistrement…",
    errors: {
      date: "La date est obligatoire.",
      diagnosis: "Le diagnostic doit contenir entre 2 et 5000 caractères.",
      reason: "Le motif doit contenir entre 2 et 5000 caractères.",
      time: "L’heure est obligatoire.",
      treatment: "Le traitement doit contenir entre 2 et 5000 caractères.",
    },
    fields: {
      date: "Date",
      diagnosis: "Diagnostic",
      reason: "Motif de la consultation",
      time: "Heure",
      treatment: "Traitement",
    },
    submitError: "La consultation n’a pas pu être enregistrée. Veuillez réessayer.",
    subtitle: "Consignez le motif, le diagnostic et le traitement de cette consultation.",
    title: "Nouvelle consultation",
  },
  ar: {
    cancel: "إلغاء",
    close: "إغلاق",
    create: "تسجيل الاستشارة",
    creating: "جارٍ التسجيل…",
    errors: {
      date: "التاريخ إلزامي.",
      diagnosis: "يجب أن يتضمن التشخيص بين 2 و5000 حرف.",
      reason: "يجب أن يتضمن السبب بين 2 و5000 حرف.",
      time: "الساعة إلزامية.",
      treatment: "يجب أن يتضمن العلاج بين 2 و5000 حرف.",
    },
    fields: {
      date: "التاريخ",
      diagnosis: "التشخيص",
      reason: "سبب الاستشارة",
      time: "الساعة",
      treatment: "العلاج",
    },
    submitError: "تعذر تسجيل الاستشارة. يرجى إعادة المحاولة.",
    subtitle: "دوّن سبب هذه الاستشارة وتشخيصها وعلاجها.",
    title: "استشارة جديدة",
  },
} as const;

function getNowDateInputValue() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function getNowTimeInputValue() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function getDefaultValues(): ConsultationFormValues {
  return {
    date: getNowDateInputValue(),
    diagnosis: "",
    reason: "",
    time: getNowTimeInputValue(),
    treatment: "",
  };
}

const fieldClass = "h-[42px] rounded-[var(--radius-sm)] border-[var(--border)] bg-[var(--surface)] text-sm text-[var(--text-primary)] shadow-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]";
const textareaClass = "min-h-24 w-full resize-y rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] p-3 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]";
const labelClass = "text-[.8rem] font-medium text-[var(--text-primary)]";

function RequiredMark() {
  return <span aria-hidden="true" className="text-[var(--danger-ink)]"> *</span>;
}

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? <p id={id} className="text-xs text-[var(--danger-ink)]">{message}</p> : null;
}

export function CreateConsultationModal({
  appointmentId,
  direction,
  isOpen,
  locale,
  onClose,
  onCreated,
  patientId,
}: CreateConsultationModalProps) {
  const copy = modalCopy[locale];
  const baseId = useId();
  const ids = {
    date: `${baseId}-date`,
    diagnosis: `${baseId}-diagnosis`,
    reason: `${baseId}-reason`,
    subtitle: `${baseId}-subtitle`,
    time: `${baseId}-time`,
    title: `${baseId}-title`,
    treatment: `${baseId}-treatment`,
  };
  const createConsultationMutation = useCreatePatientConsultation();
  const {
    formState: { errors },
    handleSubmit,
    register,
    reset,
  } = useForm<ConsultationFormValues>({ defaultValues: getDefaultValues() });

  useEffect(() => {
    if (isOpen) {
      reset(getDefaultValues());
      createConsultationMutation.reset();
    }
    // createConsultationMutation is a fresh object identity on every render;
    // only .reset needs to run once when the modal opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, reset]);

  if (!isOpen) return null;

  const closeModal = () => {
    reset(getDefaultValues());
    createConsultationMutation.reset();
    onClose();
  };

  const submit = (values: ConsultationFormValues) => {
    createConsultationMutation.mutate(
      {
        patientId,
        payload: {
          appointmentId,
          date: new Date(`${values.date}T${values.time}`).toISOString(),
          diagnosis: values.diagnosis.trim(),
          reason: values.reason.trim(),
          treatment: values.treatment.trim(),
        },
      },
      {
        onSuccess: () => {
          onCreated();
          closeModal();
        },
      },
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-[var(--scrim)]"
      role="presentation"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          closeModal();
        }
      }}
    >
      <div className="flex min-h-full items-start justify-center p-4 sm:items-center sm:p-6">
        <div
          aria-describedby={ids.subtitle}
          aria-labelledby={ids.title}
          aria-modal="true"
          className="surface-section surface-raised w-full max-w-xl overflow-hidden"
          dir={direction}
          role="dialog"
        >
          <header className="flex items-start justify-between gap-4 border-b border-[var(--border)] px-6 py-5">
            <div className="flex items-start gap-3">
              <span className="healix-mark"><ClipboardPlus size={18} strokeWidth={1.8} aria-hidden="true" /></span>
              <div>
                <h2 id={ids.title} className="text-base font-semibold text-[var(--text-primary)]">{copy.title}</h2>
                <p id={ids.subtitle} className="clinical-caption mt-0.5">{copy.subtitle}</p>
              </div>
            </div>
            <button type="button" className="clinical-icon-button -me-2 -mt-1.5 shrink-0" onClick={closeModal} aria-label={copy.close}>
              <X size={18} strokeWidth={1.8} aria-hidden="true" />
            </button>
          </header>

          <form onSubmit={handleSubmit(submit)} noValidate>
            <div className="space-y-5 px-6 py-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor={ids.date} className={labelClass}>{copy.fields.date}<RequiredMark /></Label>
                  <Input
                    id={ids.date}
                    className={fieldClass}
                    type="date"
                    aria-invalid={errors.date ? true : undefined}
                    aria-describedby={errors.date ? `${ids.date}-error` : undefined}
                    {...register("date", { required: true })}
                  />
                  <FieldError id={`${ids.date}-error`} message={errors.date ? copy.errors.date : undefined} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={ids.time} className={labelClass}>{copy.fields.time}<RequiredMark /></Label>
                  <Input
                    id={ids.time}
                    className={fieldClass}
                    type="time"
                    aria-invalid={errors.time ? true : undefined}
                    aria-describedby={errors.time ? `${ids.time}-error` : undefined}
                    {...register("time", { required: true })}
                  />
                  <FieldError id={`${ids.time}-error`} message={errors.time ? copy.errors.time : undefined} />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor={ids.reason} className={labelClass}>{copy.fields.reason}<RequiredMark /></Label>
                <textarea
                  id={ids.reason}
                  className={textareaClass}
                  maxLength={5000}
                  aria-invalid={errors.reason ? true : undefined}
                  aria-describedby={errors.reason ? `${ids.reason}-error` : undefined}
                  {...register("reason", { required: true, minLength: 2, maxLength: 5000 })}
                />
                <FieldError id={`${ids.reason}-error`} message={errors.reason ? copy.errors.reason : undefined} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor={ids.diagnosis} className={labelClass}>{copy.fields.diagnosis}<RequiredMark /></Label>
                <textarea
                  id={ids.diagnosis}
                  className={textareaClass}
                  maxLength={5000}
                  aria-invalid={errors.diagnosis ? true : undefined}
                  aria-describedby={errors.diagnosis ? `${ids.diagnosis}-error` : undefined}
                  {...register("diagnosis", { required: true, minLength: 2, maxLength: 5000 })}
                />
                <FieldError id={`${ids.diagnosis}-error`} message={errors.diagnosis ? copy.errors.diagnosis : undefined} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor={ids.treatment} className={labelClass}>{copy.fields.treatment}<RequiredMark /></Label>
                <textarea
                  id={ids.treatment}
                  className={textareaClass}
                  maxLength={5000}
                  aria-invalid={errors.treatment ? true : undefined}
                  aria-describedby={errors.treatment ? `${ids.treatment}-error` : undefined}
                  {...register("treatment", { required: true, minLength: 2, maxLength: 5000 })}
                />
                <FieldError id={`${ids.treatment}-error`} message={errors.treatment ? copy.errors.treatment : undefined} />
              </div>

              {createConsultationMutation.isError ? (
                <p role="alert" className="flex items-start gap-2 rounded-[var(--radius-sm)] border border-[var(--danger-line)] bg-[var(--danger-soft)] px-3 py-2.5 text-xs leading-relaxed text-[var(--danger-ink)]">
                  <TriangleAlert size={15} strokeWidth={1.8} className="mt-px shrink-0" aria-hidden="true" />
                  {getServerErrorMessage(createConsultationMutation.error) ?? copy.submitError}
                </p>
              ) : null}
            </div>

            <footer className="flex flex-col-reverse gap-2 border-t border-[var(--border)] bg-[var(--surface-muted)] px-6 py-4 sm:flex-row sm:justify-end">
              <button type="button" className="clinical-button" onClick={closeModal}>{copy.cancel}</button>
              <button type="submit" className="clinical-button clinical-button-primary disabled:cursor-not-allowed disabled:opacity-60" disabled={createConsultationMutation.isPending}>
                <ClipboardPlus size={16} strokeWidth={1.8} aria-hidden="true" />
                {createConsultationMutation.isPending ? copy.creating : copy.create}
              </button>
            </footer>
          </form>
        </div>
      </div>
    </div>
  );
}
