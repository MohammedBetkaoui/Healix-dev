"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarPlus, Info, Search, TriangleAlert, X } from "lucide-react";
import { useEffect, useId, useMemo, useState, type KeyboardEvent } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useAppointmentDoctors } from "@/features/appointments/hooks/use-appointment-doctors";
import { useCreateAppointment } from "@/features/appointments/hooks/use-create-appointment";
import { usePatients } from "@/features/patients/hooks/use-patients";
import { formatPatientDate, patientMatchesSearch } from "@/features/patients/patient-registry";
import { type Locale } from "@/i18n";
import { type Direction } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { type Patient } from "@/types/patient";

type CreateAppointmentModalProps = {
  accountType: "DOCTOR" | "ESTABLISHMENT";
  defaultDate: string;
  direction: Direction;
  isOpen: boolean;
  locale: Locale;
  onClose: () => void;
  onCreate: () => void;
};

type AppointmentFormValues = {
  date: string;
  doctorProfileId: string;
  durationMinutes: string;
  patientId: string;
  reason: string;
  time: string;
};

const durationOptions = ["15", "20", "30", "45", "60", "90"] as const;

const modalCopy = {
  fr: {
    cancel: "Annuler",
    change: "Changer",
    close: "Fermer",
    create: "Créer le rendez-vous",
    creating: "Création…",
    errors: {
      date: "La date est obligatoire.",
      doctor: "Sélectionnez un médecin.",
      duration: "Durée invalide.",
      patient: "Sélectionnez un patient.",
      reason: "Le motif doit contenir entre 2 et 255 caractères.",
      time: "L’heure est obligatoire.",
    },
    fields: {
      date: "Date",
      doctor: "Médecin",
      duration: "Durée",
      patient: "Patient",
      reason: "Motif de la consultation",
      time: "Heure",
    },
    minutes: "min",
    noDoctors: "Aucun médecin n’est encore rattaché à l’établissement. La prise de rendez-vous sera possible dès qu’un médecin y sera affilié.",
    noResults: "Aucun patient ne correspond à cette recherche.",
    reasonPlaceholder: "Ex : Consultation de suivi",
    searchHint: "Recherchez par nom (français ou arabe), téléphone, NIN ou n° de dossier.",
    searchPlaceholder: "Rechercher un patient…",
    selectDoctor: "Choisir un médecin",
    submitError: "Le rendez-vous n’a pas pu être créé. Veuillez réessayer.",
    subtitle: "Planifiez un rendez-vous pour un patient déjà enregistré.",
    title: "Nouveau rendez-vous",
  },
  ar: {
    cancel: "إلغاء",
    change: "تغيير",
    close: "إغلاق",
    create: "إنشاء الموعد",
    creating: "جارٍ الإنشاء…",
    errors: {
      date: "التاريخ إلزامي.",
      doctor: "اختر طبيباً.",
      duration: "مدة غير صالحة.",
      patient: "اختر مريضاً.",
      reason: "يجب أن يتضمن السبب بين 2 و255 حرفاً.",
      time: "الساعة إلزامية.",
    },
    fields: {
      date: "التاريخ",
      doctor: "الطبيب",
      duration: "المدة",
      patient: "المريض",
      reason: "سبب الاستشارة",
      time: "الساعة",
    },
    minutes: "د",
    noDoctors: "لا يوجد أي طبيب مرتبط بالمؤسسة حالياً. ستتاح برمجة المواعيد بمجرد انتساب طبيب إليها.",
    noResults: "لا يوجد مريض يطابق هذا البحث.",
    reasonPlaceholder: "مثال: استشارة متابعة",
    searchHint: "ابحث بالاسم (بالفرنسية أو العربية) أو الهاتف أو رقم التعريف أو رقم الملف.",
    searchPlaceholder: "البحث عن مريض…",
    selectDoctor: "اختر طبيباً",
    submitError: "تعذر إنشاء الموعد. يرجى إعادة المحاولة.",
    subtitle: "حدد موعداً لمريض مسجل مسبقاً.",
    title: "موعد جديد",
  },
} as const;

type ModalCopy = (typeof modalCopy)[Locale];

function createAppointmentFormSchema(copy: ModalCopy, requireDoctor: boolean) {
  return z.object({
    date: z.string().min(1, copy.errors.date),
    doctorProfileId: requireDoctor
      ? z.string().min(1, copy.errors.doctor)
      : z.string(),
    durationMinutes: z.string().refine(
      (value) => (durationOptions as readonly string[]).includes(value),
      { message: copy.errors.duration },
    ),
    patientId: z.string().min(1, copy.errors.patient),
    reason: z.string().trim().min(2, copy.errors.reason).max(255, copy.errors.reason),
    time: z.string().min(1, copy.errors.time),
  });
}

function getDefaultValues(defaultDate: string): AppointmentFormValues {
  return {
    date: defaultDate,
    doctorProfileId: "",
    durationMinutes: "30",
    patientId: "",
    reason: "",
    time: "09:00",
  };
}

function getPatientLabel(patient: Patient) {
  const latinName = `${patient.firstName} ${patient.lastName}`.trim();
  return latinName || `${patient.firstNameAr} ${patient.lastNameAr}`.trim();
}

function PatientAvatar({ patient }: { patient: Patient }) {
  const first = patient.firstName || patient.firstNameAr;
  const last = patient.lastName || patient.lastNameAr;
  return (
    <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--medical-soft)] text-[.65rem] font-semibold text-[var(--medical)]">
      {`${first.charAt(0)}${last.charAt(0)}`.toLocaleUpperCase()}
    </span>
  );
}

const fieldClass = "h-[42px] rounded-[var(--radius-sm)] border-[var(--border)] bg-[var(--surface)] text-sm text-[var(--text-primary)] shadow-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]";
const labelClass = "text-[.8rem] font-medium text-[var(--text-primary)]";

function RequiredMark() {
  return <span aria-hidden="true" className="text-[var(--danger-ink)]"> *</span>;
}

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? <p id={id} className="text-xs text-[var(--danger-ink)]">{message}</p> : null;
}

export function CreateAppointmentModal({
  accountType,
  defaultDate,
  direction,
  isOpen,
  locale,
  onClose,
  onCreate,
}: CreateAppointmentModalProps) {
  const copy = modalCopy[locale];
  const baseId = useId();
  const ids = {
    date: `${baseId}-date`,
    doctor: `${baseId}-doctor`,
    duration: `${baseId}-duration`,
    patient: `${baseId}-patient`,
    reason: `${baseId}-reason`,
    subtitle: `${baseId}-subtitle`,
    time: `${baseId}-time`,
    title: `${baseId}-title`,
  };
  const isEstablishment = accountType === "ESTABLISHMENT";
  const schema = useMemo(
    () => createAppointmentFormSchema(copy, isEstablishment),
    [copy, isEstablishment],
  );
  const createAppointmentMutation = useCreateAppointment();
  const { data: patientsResponse } = usePatients({ limit: 100 });
  const { data: doctors } = useAppointmentDoctors({ enabled: isOpen });
  const [search, setSearch] = useState("");
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    reset,
    setValue,
    watch,
  } = useForm<AppointmentFormValues>({
    defaultValues: getDefaultValues(defaultDate),
    resolver: zodResolver(schema),
  });

  useEffect(() => {
    if (isOpen) {
      reset(getDefaultValues(defaultDate));
      setSearch("");
    }
  }, [defaultDate, isOpen, reset]);

  const patients = patientsResponse?.data ?? [];
  const selectedPatientId = watch("patientId");
  const selectedPatient = patients.find((patient) => patient.id === selectedPatientId);
  const matchingPatients = search.trim()
    ? patients.filter((patient) => patientMatchesSearch(patient, search)).slice(0, 6)
    : [];
  // An INDEPENDENT_DOCTOR only ever gets their own profile back, and the
  // backend ignores the submitted id for that role anyway — but the DTO
  // still requires one, so it is filled from that single entry.
  const ownDoctorProfileId = doctors?.[0]?.id ?? "";
  const hasNoDoctors = isEstablishment && doctors !== undefined && doctors.length === 0;
  const isPending = isSubmitting || createAppointmentMutation.isPending;

  const closeModal = () => {
    reset(getDefaultValues(defaultDate));
    setSearch("");
    createAppointmentMutation.reset();
    onClose();
  };

  if (!isOpen) return null;

  const selectPatient = (patient: Patient) => {
    setValue("patientId", patient.id, { shouldValidate: true });
    setSearch("");
  };

  const clearPatient = () => {
    setValue("patientId", "", { shouldValidate: false });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      closeModal();
    }
  };

  const submit = (values: AppointmentFormValues) => {
    createAppointmentMutation.mutate(
      {
        doctorProfileId: isEstablishment ? values.doctorProfileId : ownDoctorProfileId,
        durationMinutes: Number(values.durationMinutes),
        patientId: values.patientId,
        reason: values.reason.trim(),
        scheduledAt: new Date(`${values.date}T${values.time}`).toISOString(),
      },
      {
        onSuccess: () => {
          onCreate();
          closeModal();
        },
      },
    );
  };

  const patientDetails = (patient: Patient) => (
    <>
      <bdi dir="ltr">{patient.phone}</bdi>
      {patient.birthDate ? <> · {formatPatientDate(patient.birthDate, locale)}</> : null}
    </>
  );

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[var(--scrim)]" role="presentation" onKeyDown={handleKeyDown}>
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
              <span className="healix-mark"><CalendarPlus size={18} strokeWidth={1.8} aria-hidden="true" /></span>
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
              <input type="hidden" {...register("patientId")} />

              <div className="space-y-1.5">
                <Label htmlFor={ids.patient} className={labelClass}>{copy.fields.patient}<RequiredMark /></Label>
                {selectedPatient ? (
                  <div className="flex items-center gap-3 rounded-[var(--radius-sm)] border border-[var(--accent-line)] bg-[var(--accent-soft)] px-3 py-2.5">
                    <PatientAvatar patient={selectedPatient} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{getPatientLabel(selectedPatient)}</p>
                      <p className="truncate text-xs text-[var(--text-secondary)]">{patientDetails(selectedPatient)}</p>
                    </div>
                    <button type="button" className="shrink-0 rounded-[var(--radius-xs)] px-2 py-1 text-xs font-medium text-[var(--accent-dark)] hover:underline hover:underline-offset-4" onClick={clearPatient}>
                      {copy.change}
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="relative">
                      <Search size={16} strokeWidth={1.8} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" aria-hidden="true" />
                      <Input
                        id={ids.patient}
                        autoFocus
                        autoComplete="off"
                        className={cn(fieldClass, "ps-9")}
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder={copy.searchPlaceholder}
                        type="search"
                        aria-invalid={errors.patientId ? true : undefined}
                        aria-describedby={errors.patientId ? `${ids.patient}-error` : `${ids.patient}-hint`}
                      />
                    </div>
                    {search.trim() ? (
                      matchingPatients.length === 0 ? (
                        <p className="rounded-[var(--radius-sm)] border border-dashed border-[var(--border-strong)] px-3 py-3 text-xs text-[var(--text-secondary)]">{copy.noResults}</p>
                      ) : (
                        <ul className="max-h-64 divide-y divide-[var(--line-soft)] overflow-y-auto rounded-[var(--radius-sm)] border border-[var(--border)]">
                          {matchingPatients.map((patient) => (
                            <li key={patient.id}>
                              <button type="button" className="flex w-full items-center gap-3 px-3 py-2.5 text-start hover:bg-[var(--surface-muted)] focus-visible:bg-[var(--surface-muted)]" onClick={() => selectPatient(patient)}>
                                <PatientAvatar patient={patient} />
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-sm font-medium text-[var(--text-primary)]">{getPatientLabel(patient)}</span>
                                  <span className="block truncate text-xs text-[var(--text-secondary)]">{patientDetails(patient)}</span>
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )
                    ) : (
                      <p id={`${ids.patient}-hint`} className="clinical-caption">{copy.searchHint}</p>
                    )}
                  </>
                )}
                <FieldError id={`${ids.patient}-error`} message={errors.patientId?.message} />
              </div>

              {isEstablishment ? (
                <div className="space-y-1.5">
                  <Label htmlFor={ids.doctor} className={labelClass}>{copy.fields.doctor}<RequiredMark /></Label>
                  {hasNoDoctors ? (
                    <p className="flex items-start gap-2 rounded-[var(--radius-sm)] border border-[var(--warning-line)] bg-[var(--warning-soft)] px-3 py-2.5 text-xs leading-relaxed text-[var(--warning-ink)]">
                      <Info size={15} strokeWidth={1.8} className="mt-px shrink-0" aria-hidden="true" />
                      {copy.noDoctors}
                    </p>
                  ) : (
                    <Select
                      id={ids.doctor}
                      className={fieldClass}
                      aria-invalid={errors.doctorProfileId ? true : undefined}
                      aria-describedby={errors.doctorProfileId ? `${ids.doctor}-error` : undefined}
                      {...register("doctorProfileId")}
                    >
                      <option value="">{copy.selectDoctor}</option>
                      {(doctors ?? []).map((doctor) => (
                        <option key={doctor.id} value={doctor.id}>{doctor.fullName} · {doctor.speciality}</option>
                      ))}
                    </Select>
                  )}
                  <FieldError id={`${ids.doctor}-error`} message={errors.doctorProfileId?.message} />
                </div>
              ) : null}

              <div className="grid gap-4 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
                <div className="space-y-1.5">
                  <Label htmlFor={ids.date} className={labelClass}>{copy.fields.date}<RequiredMark /></Label>
                  <Input
                    id={ids.date}
                    className={fieldClass}
                    type="date"
                    aria-invalid={errors.date ? true : undefined}
                    aria-describedby={errors.date ? `${ids.date}-error` : undefined}
                    {...register("date")}
                  />
                  <FieldError id={`${ids.date}-error`} message={errors.date?.message} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={ids.time} className={labelClass}>{copy.fields.time}<RequiredMark /></Label>
                  <Input
                    id={ids.time}
                    className={fieldClass}
                    type="time"
                    aria-invalid={errors.time ? true : undefined}
                    aria-describedby={errors.time ? `${ids.time}-error` : undefined}
                    {...register("time")}
                  />
                  <FieldError id={`${ids.time}-error`} message={errors.time?.message} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={ids.duration} className={labelClass}>{copy.fields.duration}</Label>
                  <Select id={ids.duration} className={fieldClass} {...register("durationMinutes")}>
                    {durationOptions.map((value) => <option key={value} value={value}>{value} {copy.minutes}</option>)}
                  </Select>
                  <FieldError id={`${ids.duration}-error`} message={errors.durationMinutes?.message} />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor={ids.reason} className={labelClass}>{copy.fields.reason}<RequiredMark /></Label>
                <Input
                  id={ids.reason}
                  className={fieldClass}
                  maxLength={255}
                  placeholder={copy.reasonPlaceholder}
                  aria-invalid={errors.reason ? true : undefined}
                  aria-describedby={errors.reason ? `${ids.reason}-error` : undefined}
                  {...register("reason")}
                />
                <FieldError id={`${ids.reason}-error`} message={errors.reason?.message} />
              </div>

              {createAppointmentMutation.isError ? (
                <p role="alert" className="flex items-start gap-2 rounded-[var(--radius-sm)] border border-[var(--danger-line)] bg-[var(--danger-soft)] px-3 py-2.5 text-xs leading-relaxed text-[var(--danger-ink)]">
                  <TriangleAlert size={15} strokeWidth={1.8} className="mt-px shrink-0" aria-hidden="true" />
                  {copy.submitError}
                </p>
              ) : null}
            </div>

            <footer className="flex flex-col-reverse gap-2 border-t border-[var(--border)] bg-[var(--surface-muted)] px-6 py-4 sm:flex-row sm:justify-end">
              <button type="button" className="clinical-button" onClick={closeModal}>{copy.cancel}</button>
              <button type="submit" className="clinical-button clinical-button-primary disabled:cursor-not-allowed disabled:opacity-60" disabled={isPending || hasNoDoctors}>
                <CalendarPlus size={16} strokeWidth={1.8} aria-hidden="true" />
                {isPending ? copy.creating : copy.create}
              </button>
            </footer>
          </form>
        </div>
      </div>
    </div>
  );
}
