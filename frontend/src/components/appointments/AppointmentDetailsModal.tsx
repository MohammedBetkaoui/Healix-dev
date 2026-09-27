"use client";

import {
  Ban,
  CalendarCheck,
  CalendarClock,
  CircleCheck,
  Pencil,
  Stethoscope,
  TriangleAlert,
  UserX,
  X,
} from "lucide-react";
import { useEffect, useId, useState } from "react";
import { useForm } from "react-hook-form";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/dashboard/shared/StatusBadge";
import { CreateConsultationModal } from "@/components/patients/CreateConsultationModal";
import { type Appointment, type AppointmentStatus } from "@/features/appointments/appointments.types";
import { useUpdateAppointment } from "@/features/appointments/hooks/use-update-appointment";
import { type Locale } from "@/i18n";
import { getServerErrorMessage } from "@/lib/api/get-server-error-message";
import { type Direction } from "@/lib/i18n";
import { type DashboardStatusTone } from "@/types/dashboard";

type AppointmentDetailsModalProps = {
  accountType: "DOCTOR" | "ESTABLISHMENT";
  appointment: Appointment | null;
  direction: Direction;
  locale: Locale;
  onClose: () => void;
  onUpdated: () => void;
};

type EditFormValues = {
  date: string;
  durationMinutes: string;
  notes: string;
  reason: string;
  time: string;
};

const durationOptions = ["15", "20", "30", "45", "60", "90"] as const;

const statusTone: Record<AppointmentStatus, DashboardStatusTone> = {
  CANCELED: "neutral",
  COMPLETED: "success",
  CONFIRMED: "info",
  NO_SHOW: "danger",
  SCHEDULED: "neutral",
};

const detailsCopy = {
  fr: {
    cancelBanner: {
      back: "Retour",
      confirm: "Confirmer l’annulation",
      description: "Cette action annule le rendez-vous. Le patient devra être prévenu séparément.",
    },
    close: "Fermer",
    edit: "Modifier",
    editTitle: "Modifier le rendez-vous",
    errors: {
      date: "La date est obligatoire.",
      reason: "Le motif doit contenir entre 2 et 255 caractères.",
      time: "L’heure est obligatoire.",
    },
    consultationLinked: "Consultation enregistrée pour ce rendez-vous.",
    fields: {
      date: "Date",
      duration: "Durée",
      noNotes: "Aucune note enregistrée.",
      notes: "Notes internes",
      reason: "Motif de la consultation",
      time: "Heure",
    },
    minutes: "min",
    quickActions: {
      cancel: "Annuler le rendez-vous",
      complete: "Marquer terminé",
      confirm: "Confirmer",
      noShow: "Patient absent",
    },
    saveChanges: "Enregistrer les modifications",
    saving: "Enregistrement…",
    statuses: {
      CANCELED: "Annulé",
      COMPLETED: "Terminé",
      CONFIRMED: "Confirmé",
      NO_SHOW: "Absent",
      SCHEDULED: "Planifié",
    },
    subtitle: "Consultez les informations et enregistrez les changements de statut.",
    title: "Détails du rendez-vous",
    updateError: "L’action n’a pas pu être enregistrée. Veuillez réessayer.",
    backToDetails: "Retour",
  },
  ar: {
    cancelBanner: {
      back: "رجوع",
      confirm: "تأكيد الإلغاء",
      description: "سيؤدي هذا الإجراء إلى إلغاء الموعد. يجب إبلاغ المريض بشكل منفصل.",
    },
    close: "إغلاق",
    edit: "تعديل",
    editTitle: "تعديل الموعد",
    errors: {
      date: "التاريخ إلزامي.",
      reason: "يجب أن يتضمن السبب بين 2 و255 حرفاً.",
      time: "الساعة إلزامية.",
    },
    consultationLinked: "تم تسجيل استشارة لهذا الموعد.",
    fields: {
      date: "التاريخ",
      duration: "المدة",
      noNotes: "لا توجد ملاحظات مسجلة.",
      notes: "ملاحظات داخلية",
      reason: "سبب الاستشارة",
      time: "الساعة",
    },
    minutes: "د",
    quickActions: {
      cancel: "إلغاء الموعد",
      complete: "وضع علامة منجز",
      confirm: "تأكيد",
      noShow: "المريض غائب",
    },
    saveChanges: "حفظ التعديلات",
    saving: "جارٍ الحفظ…",
    statuses: {
      CANCELED: "ملغى",
      COMPLETED: "منجز",
      CONFIRMED: "مؤكد",
      NO_SHOW: "غائب",
      SCHEDULED: "مبرمج",
    },
    subtitle: "اطّلع على المعلومات وسجّل تغييرات الحالة.",
    title: "تفاصيل الموعد",
    updateError: "تعذر تسجيل الإجراء. يرجى إعادة المحاولة.",
    backToDetails: "رجوع",
  },
} as const;

function getPatientName(appointment: Appointment) {
  const latinName = `${appointment.patientFirstName} ${appointment.patientLastName}`.trim();
  return latinName || `${appointment.patientFirstNameAr} ${appointment.patientLastNameAr}`.trim();
}

function getPatientInitials(appointment: Appointment) {
  const first = appointment.patientFirstName || appointment.patientFirstNameAr;
  const last = appointment.patientLastName || appointment.patientLastNameAr;
  return `${first.charAt(0)}${last.charAt(0)}`.toLocaleUpperCase();
}

function toDateInputValue(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function toTimeInputValue(date: Date) {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function getEditFormValues(appointment: Appointment): EditFormValues {
  const scheduledAt = new Date(appointment.scheduledAt);
  return {
    date: toDateInputValue(scheduledAt),
    durationMinutes: String(appointment.durationMinutes),
    notes: appointment.notes ?? "",
    reason: appointment.reason,
    time: toTimeInputValue(scheduledAt),
  };
}

const fieldClass = "h-[42px] rounded-[var(--radius-sm)] border-[var(--border)] bg-[var(--surface)] text-sm text-[var(--text-primary)] shadow-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]";
const textareaClass = "min-h-24 w-full resize-y rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] p-3 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]";
const labelClass = "text-[.8rem] font-medium text-[var(--text-primary)]";

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? <p id={id} className="text-xs text-[var(--danger-ink)]">{message}</p> : null;
}

export function AppointmentDetailsModal({
  accountType,
  appointment,
  direction,
  locale,
  onClose,
  onUpdated,
}: AppointmentDetailsModalProps) {
  const copy = detailsCopy[locale];
  const baseId = useId();
  const isEstablishment = accountType === "ESTABLISHMENT";
  const updateMutation = useUpdateAppointment();
  const [current, setCurrent] = useState(appointment);
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [isConfirmingCancel, setConfirmingCancel] = useState(false);
  const [isConsultationPromptOpen, setConsultationPromptOpen] = useState(false);
  const {
    formState: { errors: formErrors },
    handleSubmit,
    register,
    reset,
  } = useForm<EditFormValues>({
    defaultValues: appointment ? getEditFormValues(appointment) : undefined,
  });

  useEffect(() => {
    setCurrent(appointment);
    setMode("view");
    setConfirmingCancel(false);
    setConsultationPromptOpen(false);
    updateMutation.reset();
    if (appointment) reset(getEditFormValues(appointment));
    // updateMutation is stable across renders (react-query mutation object identity
    // is not; only .reset needs to run once per appointment change).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appointment]);

  if (!current) return null;

  const intlLocale = locale === "ar" ? "ar-DZ" : "fr-DZ";
  const dateFormatter = new Intl.DateTimeFormat(intlLocale, { day: "numeric", month: "long", weekday: "long", year: "numeric" });
  const timeFormatter = new Intl.DateTimeFormat(intlLocale, { hour: "2-digit", hourCycle: "h23", minute: "2-digit" });
  const numberFormat = new Intl.NumberFormat(intlLocale);
  const scheduledAt = new Date(current.scheduledAt);
  const endsAt = new Date(scheduledAt.getTime() + current.durationMinutes * 60_000);
  const isTerminal = current.status === "CANCELED" || current.status === "COMPLETED";

  const closeModal = () => {
    onClose();
  };

  const applyStatus = (status: AppointmentStatus) => {
    updateMutation.mutate(
      { id: current.id, payload: { status } },
      {
        onSuccess: (updated) => {
          setCurrent(updated);
          setConfirmingCancel(false);
          // Offer to open the consultation form right away when this RDV has
          // never had one recorded. If a consultation is already linked (e.g.
          // rescheduling a previously COMPLETED appointment), skip the prompt
          // and keep the existing behavior of just refreshing the agenda.
          if (status === "COMPLETED" && updated.consultationId === null) {
            setConsultationPromptOpen(true);
          } else {
            onUpdated();
          }
        },
      },
    );
  };

  const submitEdit = (values: EditFormValues) => {
    updateMutation.mutate(
      {
        id: current.id,
        payload: {
          durationMinutes: Number(values.durationMinutes),
          notes: values.notes.trim() || undefined,
          reason: values.reason.trim(),
          scheduledAt: new Date(`${values.date}T${values.time}`).toISOString(),
        },
      },
      {
        onSuccess: (updated) => {
          setCurrent(updated);
          setMode("view");
          onUpdated();
        },
      },
    );
  };

  const ids = {
    date: `${baseId}-date`,
    duration: `${baseId}-duration`,
    notes: `${baseId}-notes`,
    reason: `${baseId}-reason`,
    subtitle: `${baseId}-subtitle`,
    time: `${baseId}-time`,
    title: `${baseId}-title`,
  };

  return (
    <>
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
              <span className="healix-mark">
                {mode === "edit" ? <Pencil size={18} strokeWidth={1.8} aria-hidden="true" /> : <CalendarClock size={18} strokeWidth={1.8} aria-hidden="true" />}
              </span>
              <div>
                <h2 id={ids.title} className="text-base font-semibold text-[var(--text-primary)]">
                  {mode === "edit" ? copy.editTitle : copy.title}
                </h2>
                <p id={ids.subtitle} className="clinical-caption mt-0.5">{mode === "edit" ? getPatientName(current) : copy.subtitle}</p>
              </div>
            </div>
            <button type="button" className="clinical-icon-button -me-2 -mt-1.5 shrink-0" onClick={closeModal} aria-label={copy.close}>
              <X size={18} strokeWidth={1.8} aria-hidden="true" />
            </button>
          </header>

          {mode === "view" ? (
            <>
              <div className="space-y-5 px-6 py-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--medical-soft)] text-[.75rem] font-semibold text-[var(--medical)]">
                      {getPatientInitials(current)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{getPatientName(current)}</p>
                      {isEstablishment ? (
                        <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-[var(--text-secondary)]">
                          <Stethoscope size={13} strokeWidth={1.8} className="shrink-0" aria-hidden="true" />
                          {current.doctorFullName}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <StatusBadge label={copy.statuses[current.status]} tone={statusTone[current.status]} />
                </div>

                <dl className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <dt className="clinical-caption">{copy.fields.date}</dt>
                    <dd className="mt-1 text-sm text-[var(--text-primary)]">{dateFormatter.format(scheduledAt)}</dd>
                  </div>
                  <div>
                    <dt className="clinical-caption">{copy.fields.time}</dt>
                    <dd className="mt-1 text-sm text-[var(--text-primary)]">
                      <bdi dir="ltr">{timeFormatter.format(scheduledAt)} – {timeFormatter.format(endsAt)}</bdi> · {numberFormat.format(current.durationMinutes)} {copy.minutes}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="clinical-caption">{copy.fields.reason}</dt>
                    <dd className="mt-1 text-sm text-[var(--text-primary)]">{current.reason}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="clinical-caption">{copy.fields.notes}</dt>
                    <dd className="mt-1 whitespace-pre-wrap text-sm text-[var(--text-primary)]">{current.notes || copy.fields.noNotes}</dd>
                  </div>
                </dl>

                {current.consultationId ? (
                  <p className="flex items-center gap-2 text-xs font-medium text-[var(--success-ink)]">
                    <CircleCheck size={15} strokeWidth={1.8} className="shrink-0" aria-hidden="true" />
                    {copy.consultationLinked}
                  </p>
                ) : null}

                {updateMutation.isError ? (
                  <p role="alert" className="flex items-start gap-2 rounded-[var(--radius-sm)] border border-[var(--danger-line)] bg-[var(--danger-soft)] px-3 py-2.5 text-xs leading-relaxed text-[var(--danger-ink)]">
                    <TriangleAlert size={15} strokeWidth={1.8} className="mt-px shrink-0" aria-hidden="true" />
                    {getServerErrorMessage(updateMutation.error) ?? copy.updateError}
                  </p>
                ) : null}

                {isConfirmingCancel ? (
                  <div className="rounded-[var(--radius-sm)] border border-[var(--danger-line)] bg-[var(--danger-soft)] p-4">
                    <p className="flex items-start gap-2 text-xs leading-relaxed text-[var(--danger-ink)]">
                      <TriangleAlert size={15} strokeWidth={1.8} className="mt-px shrink-0" aria-hidden="true" />
                      {copy.cancelBanner.description}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" className="clinical-button" onClick={() => setConfirmingCancel(false)} disabled={updateMutation.isPending}>
                        {copy.cancelBanner.back}
                      </button>
                      <button
                        type="button"
                        className="clinical-button border-[var(--danger-line)] bg-[var(--danger)] text-white hover:bg-[var(--danger)]"
                        onClick={() => applyStatus("CANCELED")}
                        disabled={updateMutation.isPending}
                      >
                        <Ban size={16} strokeWidth={1.8} aria-hidden="true" />
                        {copy.cancelBanner.confirm}
                      </button>
                    </div>
                  </div>
                ) : !isTerminal ? (
                  <div className="flex flex-wrap gap-2">
                    {current.status === "SCHEDULED" ? (
                      <button type="button" className="clinical-button" onClick={() => applyStatus("CONFIRMED")} disabled={updateMutation.isPending}>
                        <CircleCheck size={16} strokeWidth={1.8} className="text-[var(--accent)]" aria-hidden="true" />
                        {copy.quickActions.confirm}
                      </button>
                    ) : null}
                    <button type="button" className="clinical-button" onClick={() => applyStatus("COMPLETED")} disabled={updateMutation.isPending}>
                      <CalendarCheck size={16} strokeWidth={1.8} className="text-[var(--success)]" aria-hidden="true" />
                      {copy.quickActions.complete}
                    </button>
                    <button type="button" className="clinical-button" onClick={() => applyStatus("NO_SHOW")} disabled={updateMutation.isPending}>
                      <UserX size={16} strokeWidth={1.8} className="text-[var(--warning-ink)]" aria-hidden="true" />
                      {copy.quickActions.noShow}
                    </button>
                    <button type="button" className="clinical-button" onClick={() => setConfirmingCancel(true)} disabled={updateMutation.isPending}>
                      <Ban size={16} strokeWidth={1.8} className="text-[var(--danger-ink)]" aria-hidden="true" />
                      {copy.quickActions.cancel}
                    </button>
                  </div>
                ) : null}
              </div>

              <footer className="flex flex-col-reverse gap-2 border-t border-[var(--border)] bg-[var(--surface-muted)] px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
                <button type="button" className="clinical-button" onClick={closeModal}>{copy.close}</button>
                <button type="button" className="clinical-button clinical-button-primary" onClick={() => setMode("edit")}>
                  <Pencil size={16} strokeWidth={1.8} aria-hidden="true" />
                  {copy.edit}
                </button>
              </footer>
            </>
          ) : (
            <form onSubmit={handleSubmit(submitEdit)} noValidate>
              <div className="space-y-5 px-6 py-5">
                <div className="grid gap-4 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
                  <div className="space-y-1.5">
                    <Label htmlFor={ids.date} className={labelClass}>{copy.fields.date}</Label>
                    <Input id={ids.date} className={fieldClass} type="date" aria-invalid={formErrors.date ? true : undefined} aria-describedby={formErrors.date ? `${ids.date}-error` : undefined} {...register("date", { required: true })} />
                    <FieldError id={`${ids.date}-error`} message={formErrors.date ? copy.errors.date : undefined} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={ids.time} className={labelClass}>{copy.fields.time}</Label>
                    <Input id={ids.time} className={fieldClass} type="time" aria-invalid={formErrors.time ? true : undefined} aria-describedby={formErrors.time ? `${ids.time}-error` : undefined} {...register("time", { required: true })} />
                    <FieldError id={`${ids.time}-error`} message={formErrors.time ? copy.errors.time : undefined} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={ids.duration} className={labelClass}>{copy.fields.duration}</Label>
                    <Select id={ids.duration} className={fieldClass} {...register("durationMinutes")}>
                      {durationOptions.map((value) => <option key={value} value={value}>{value} {copy.minutes}</option>)}
                    </Select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor={ids.reason} className={labelClass}>{copy.fields.reason}</Label>
                  <Input id={ids.reason} className={fieldClass} maxLength={255} aria-invalid={formErrors.reason ? true : undefined} aria-describedby={formErrors.reason ? `${ids.reason}-error` : undefined} {...register("reason", { required: true, minLength: 2, maxLength: 255 })} />
                  <FieldError id={`${ids.reason}-error`} message={formErrors.reason ? copy.errors.reason : undefined} />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor={ids.notes} className={labelClass}>{copy.fields.notes}</Label>
                  <textarea id={ids.notes} className={textareaClass} maxLength={5000} {...register("notes")} />
                </div>

                {updateMutation.isError ? (
                  <p role="alert" className="flex items-start gap-2 rounded-[var(--radius-sm)] border border-[var(--danger-line)] bg-[var(--danger-soft)] px-3 py-2.5 text-xs leading-relaxed text-[var(--danger-ink)]">
                    <TriangleAlert size={15} strokeWidth={1.8} className="mt-px shrink-0" aria-hidden="true" />
                    {getServerErrorMessage(updateMutation.error) ?? copy.updateError}
                  </p>
                ) : null}
              </div>

              <footer className="flex flex-col-reverse gap-2 border-t border-[var(--border)] bg-[var(--surface-muted)] px-6 py-4 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  className="clinical-button"
                  onClick={() => {
                    reset(getEditFormValues(current));
                    updateMutation.reset();
                    setMode("view");
                  }}
                >
                  {copy.backToDetails}
                </button>
                <button type="submit" className="clinical-button clinical-button-primary disabled:cursor-not-allowed disabled:opacity-60" disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? copy.saving : copy.saveChanges}
                </button>
              </footer>
            </form>
          )}
        </div>
      </div>
    </div>

    <CreateConsultationModal
      appointmentId={current.id}
      direction={direction}
      isOpen={isConsultationPromptOpen}
      locale={locale}
      patientId={current.patientId}
      onClose={() => {
        setConsultationPromptOpen(false);
        // The RDV was already marked COMPLETED before this prompt opened, so
        // declining to log a consultation now still means the agenda needs
        // its "updated" notice.
        onUpdated();
      }}
      onCreated={() => {
        setConsultationPromptOpen(false);
        onUpdated();
        closeModal();
      }}
    />
    </>
  );
}
