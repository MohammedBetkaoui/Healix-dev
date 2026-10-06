"use client";

import {
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  CalendarPlus,
  CalendarX2,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  RotateCcw,
  Stethoscope,
  TriangleAlert,
} from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";

import { AppointmentDetailsModal } from "@/components/appointments/AppointmentDetailsModal";
import { CreateAppointmentModal } from "@/components/appointments/CreateAppointmentModal";
import { DashboardShell } from "@/components/dashboard/layout/DashboardShell";
import { doctorNavSections, establishmentNavSections } from "@/components/dashboard/layout/navigation";
import { OperationalMetricCard } from "@/components/dashboard/shared/OperationalMetricCard";
import { StatusBadge } from "@/components/dashboard/shared/StatusBadge";
import { VerificationRequiredNotice } from "@/components/shared/VerificationRequiredNotice";
import { Select } from "@/components/ui/select";
import { useCurrentUser } from "@/features/auth/hooks/use-current-user";
import { useEstablishmentVerificationPrefill } from "@/features/verification/hooks/use-establishment-verification-prefill";
import { type Appointment, type AppointmentStatus } from "@/features/appointments/appointments.types";
import { useAppointmentDoctors } from "@/features/appointments/hooks/use-appointment-doctors";
import { useAppointments } from "@/features/appointments/hooks/use-appointments";
import { isVerificationRequiredError } from "@/lib/api/api-error";
import { getAccountInitials } from "@/lib/format/get-account-initials";
import { useStoredLocale, useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { type DashboardStatusTone } from "@/types/dashboard";

type AccountType = "DOCTOR" | "ESTABLISHMENT";

type AppointmentsAgendaPageProps = {
  accountType: AccountType;
};

const agendaCopy = {
  fr: {
    added: "Rendez-vous créé avec succès.",
    allDoctors: "Tous les médecins",
    context: { DOCTOR: "Mon agenda", ESTABLISHMENT: "Agenda de l’établissement" },
    doctorFilter: "Filtrer par médecin",
    count: (value: string) => `${value} rendez-vous`,
    datePicker: "Aller à une date",
    doctorCount: (count: number, value: string) => `${value} médecin${count > 1 ? "s" : ""}`,
    duration: { hours: "h", minutes: "min" },
    empty: {
      description: "Aucun rendez-vous n’est planifié à cette date. Créez-en un pour un patient déjà enregistré.",
      title: "Aucun rendez-vous ce jour",
    },
    error: {
      description: "Vérifiez votre connexion puis réessayez.",
      retry: "Réessayer",
      title: "Impossible de charger l’agenda",
    },
    loading: "Chargement des rendez-vous…",
    metrics: {
      absences: "Absences et annulations",
      absencesHint: (noShow: string, canceled: string) => `Absents : ${noShow} · Annulés : ${canceled}`,
      completed: "Terminés",
      completedHint: "Consultations réalisées",
      toConfirm: "À confirmer",
      toConfirmHint: (confirmed: string) => `Confirmés : ${confirmed}`,
      total: "Rendez-vous",
      totalHint: (duration: string) => `Durée prévue : ${duration}`,
    },
    navigation: "Navigation par jour",
    new: "Nouveau rendez-vous",
    next: "Jour suivant",
    now: "Maintenant",
    previous: "Jour précédent",
    schedule: {
      subtitle: {
        DOCTOR: "Vos rendez-vous du jour, triés par heure.",
        ESTABLISHMENT: "Rendez-vous de tous les médecins, triés par heure.",
      },
      title: "Programme de la journée",
    },
    statuses: {
      CANCELED: "Annulé",
      COMPLETED: "Terminé",
      CONFIRMED: "Confirmé",
      NO_SHOW: "Absent",
      SCHEDULED: "Planifié",
    },
    today: "Aujourd’hui",
    updated: "Rendez-vous mis à jour avec succès.",
  },
  ar: {
    added: "تم إنشاء الموعد بنجاح.",
    allDoctors: "جميع الأطباء",
    context: { DOCTOR: "أجندتي", ESTABLISHMENT: "أجندة المؤسسة" },
    doctorFilter: "التصفية حسب الطبيب",
    count: (value: string) => `المواعيد: ${value}`,
    datePicker: "الانتقال إلى تاريخ",
    doctorCount: (_count: number, value: string) => `الأطباء: ${value}`,
    duration: { hours: "س", minutes: "د" },
    empty: {
      description: "لم تتم برمجة أي موعد في هذا التاريخ. أنشئ موعداً لمريض مسجل مسبقاً.",
      title: "لا توجد مواعيد في هذا اليوم",
    },
    error: {
      description: "تحقق من الاتصال ثم أعد المحاولة.",
      retry: "إعادة المحاولة",
      title: "تعذر تحميل الأجندة",
    },
    loading: "جارٍ تحميل المواعيد…",
    metrics: {
      absences: "الغياب والإلغاء",
      absencesHint: (noShow: string, canceled: string) => `الغياب: ${noShow} · الإلغاء: ${canceled}`,
      completed: "المنجزة",
      completedHint: "استشارات تمت",
      toConfirm: "في انتظار التأكيد",
      toConfirmHint: (confirmed: string) => `المؤكدة: ${confirmed}`,
      total: "المواعيد",
      totalHint: (duration: string) => `المدة المتوقعة: ${duration}`,
    },
    navigation: "التنقل بين الأيام",
    new: "موعد جديد",
    next: "اليوم التالي",
    now: "الآن",
    previous: "اليوم السابق",
    schedule: {
      subtitle: {
        DOCTOR: "مواعيدك لهذا اليوم مرتبة حسب الساعة.",
        ESTABLISHMENT: "مواعيد جميع الأطباء مرتبة حسب الساعة.",
      },
      title: "برنامج اليوم",
    },
    statuses: {
      CANCELED: "ملغى",
      COMPLETED: "منجز",
      CONFIRMED: "مؤكد",
      NO_SHOW: "غائب",
      SCHEDULED: "مبرمج",
    },
    today: "اليوم",
    updated: "تم تحديث الموعد بنجاح.",
  },
} as const;

// Tones follow the dashboard activity table (confirmed = info,
// completed = success); the rail repeats the tone at the row's start edge.
const statusPresentation: Record<AppointmentStatus, { rail: string; tone: DashboardStatusTone }> = {
  CANCELED: { rail: "var(--line)", tone: "neutral" },
  COMPLETED: { rail: "var(--success)", tone: "success" },
  CONFIRMED: { rail: "var(--accent)", tone: "info" },
  NO_SHOW: { rail: "var(--danger)", tone: "danger" },
  SCHEDULED: { rail: "var(--border-strong)", tone: "neutral" },
};

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function toDateInputValue(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function capitalizeFirst(value: string, locale: string) {
  return value.charAt(0).toLocaleUpperCase(locale) + value.slice(1);
}

function getPatientName(appointment: Appointment) {
  const latinName = `${appointment.patientFirstName} ${appointment.patientLastName}`.trim();
  return latinName || `${appointment.patientFirstNameAr} ${appointment.patientLastNameAr}`.trim();
}

function getPatientInitials(appointment: Appointment) {
  const first = appointment.patientFirstName || appointment.patientFirstNameAr;
  const last = appointment.patientLastName || appointment.patientLastNameAr;
  return `${first.charAt(0)}${last.charAt(0)}`.toLocaleUpperCase();
}

function SkeletonBlock({ className }: { className: string }) {
  return <span className={cn("block animate-pulse rounded-[var(--radius-xs)] bg-[var(--surface-muted)]", className)} />;
}

export function AppointmentsAgendaPage({ accountType }: AppointmentsAgendaPageProps) {
  const { locale } = useStoredLocale();
  const { direction, t } = useTranslation(locale);
  const currentUser = useCurrentUser(undefined, { enabled: true });
  // Establishment name for the workspace subtitle; skipped for doctor
  // accounts (ESTABLISHMENT_ADMIN-only endpoint).
  const prefill = useEstablishmentVerificationPrefill({ enabled: accountType === "ESTABLISHMENT" });
  const initials = getAccountInitials(currentUser.data?.fullName);
  const copy = agendaCopy[locale];
  const [selectedDate, setSelectedDate] = useState(() => startOfDay(new Date()));
  const [isCreateOpen, setCreateOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [notice, setNotice] = useState("");
  const [now, setNow] = useState(() => new Date());
  const [selectedDoctorId, setSelectedDoctorId] = useState<string | null>(null);
  const isEstablishment = accountType === "ESTABLISHMENT";
  const { data: doctors } = useAppointmentDoctors({ enabled: isEstablishment });

  // Keeps the "now" marker (and "today") current on a page left open.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  // Local day bounds, sent as UTC instants: the backend compares scheduledAt
  // in UTC, so this keeps "today" aligned with the user's own timezone.
  const range = useMemo(() => ({
    from: selectedDate.toISOString(),
    to: new Date(addDays(selectedDate, 1).getTime() - 1).toISOString(),
    ...(selectedDoctorId ? { doctorProfileId: selectedDoctorId } : {}),
  }), [selectedDate, selectedDoctorId]);
  const { data: appointments, error, isError, isLoading, refetch } = useAppointments(range);

  const intlLocale = locale === "ar" ? "ar-DZ" : "fr-DZ";
  const numberFormat = new Intl.NumberFormat(intlLocale);
  const formatNumber = (value: number) => numberFormat.format(value);
  // fr-DZ defaults to a 12-hour clock; a clinical agenda reads in 24h.
  const timeFormatter = new Intl.DateTimeFormat(intlLocale, { hour: "2-digit", hourCycle: "h23", minute: "2-digit" });
  const today = startOfDay(now);
  const isToday = selectedDate.getTime() === today.getTime();
  const dayOffset = Math.round((selectedDate.getTime() - today.getTime()) / 86_400_000);
  const dayTitle = capitalizeFirst(
    new Intl.DateTimeFormat(intlLocale, { day: "numeric", month: "long", weekday: "long", year: "numeric" }).format(selectedDate),
    intlLocale,
  );
  const relativeDay = capitalizeFirst(
    new Intl.RelativeTimeFormat(intlLocale, { numeric: "auto" }).format(dayOffset, "day"),
    intlLocale,
  );

  // Non-breaking spaces keep "3 h 55 min" on one line in narrow metric cards.
  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    if (hours && rest) return `${formatNumber(hours)} ${copy.duration.hours} ${formatNumber(rest)} ${copy.duration.minutes}`;
    if (hours) return `${formatNumber(hours)} ${copy.duration.hours}`;
    return `${formatNumber(rest)} ${copy.duration.minutes}`;
  };

  const list = appointments ?? [];
  const countByStatus = (status: AppointmentStatus) => list.filter((appointment) => appointment.status === status).length;
  const plannedMinutes = list
    .filter((appointment) => appointment.status !== "CANCELED")
    .reduce((total, appointment) => total + appointment.durationMinutes, 0);
  const doctorCount = new Set(list.map((appointment) => appointment.doctorProfileId)).size;
  const hasData = appointments !== undefined;
  const metricValue = (value: number) => (hasData ? formatNumber(value) : "—");
  const scheduledCount = countByStatus("SCHEDULED");

  // "Now" marker: sits before the first appointment that has not started yet.
  const firstUpcomingIndex = list.findIndex((appointment) => new Date(appointment.scheduledAt).getTime() > now.getTime());
  const nowMarkerIndex = isToday && list.length > 0 ? (firstUpcomingIndex === -1 ? list.length : firstUpcomingIndex) : -1;

  const openCreate = () => setCreateOpen(true);

  const shellProps = isEstablishment
    ? {
        accountType: "ESTABLISHMENT" as const,
        navSections: establishmentNavSections,
        titleKey: "dashboard.sidebar.establishment.appointments",
        user: { accountType: "ESTABLISHMENT" as const, footerSubtitle: t("dashboard.clinical.administration"), initials, name: currentUser.data?.fullName || t("dashboard.clinical.administration"), roleKey: "dashboard.common.roles.establishment", workspaceSubtitle: prefill.data?.establishment.name || t("dashboard.clinical.workspace") },
      }
    : {
        accountType: "INDEPENDENT_DOCTOR" as const,
        navSections: doctorNavSections,
        titleKey: "dashboard.sidebar.doctor.appointments",
        user: { accountType: "INDEPENDENT_DOCTOR" as const, footerSubtitle: t("dashboard.clinical.doctor.practice"), initials, name: currentUser.data?.fullName || t("dashboard.clinical.doctor.workspace"), roleKey: "dashboard.common.roles.doctor", workspaceSubtitle: t("dashboard.clinical.doctor.workspace") },
      };

  const nowMarker = (
    <li aria-hidden="true" className="flex items-center gap-2 px-5 py-1.5">
      <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--danger)]" />
      <span className="text-[.68rem] font-semibold text-[var(--danger-ink)]">
        {copy.now} · <bdi dir="ltr">{timeFormatter.format(now)}</bdi>
      </span>
      <span className="h-px flex-1 bg-[var(--danger)]" />
    </li>
  );

  return (
    <DashboardShell {...shellProps} activeKey="appointments">
      <div className="workspace-stack">
        <header className="workspace-intro">
          <div className="min-w-0">
            <p className="mb-2 text-xs font-medium text-[var(--medical)]">{copy.context[accountType]}</p>
            <h1 className="break-words">{dayTitle}</h1>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              {relativeDay}
              {hasData ? <> · {copy.count(formatNumber(list.length))}</> : null}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div role="group" aria-label={copy.navigation} className="inline-flex items-center rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)]">
              <button type="button" className="clinical-icon-button" onClick={() => setSelectedDate((date) => addDays(date, -1))} aria-label={copy.previous} title={copy.previous}>
                <ChevronLeft size={17} strokeWidth={1.8} className="clinical-directional" aria-hidden="true" />
              </button>
              <button
                type="button"
                className={cn(
                  "h-[42px] border-x border-[var(--border)] px-3 text-[.8rem] font-medium hover:bg-[var(--surface-muted)]",
                  isToday ? "text-[var(--medical)]" : "text-[var(--text-primary)]",
                )}
                onClick={() => setSelectedDate(startOfDay(new Date()))}
                aria-current={isToday ? "date" : undefined}
              >
                {copy.today}
              </button>
              <button type="button" className="clinical-icon-button" onClick={() => setSelectedDate((date) => addDays(date, 1))} aria-label={copy.next} title={copy.next}>
                <ChevronRight size={17} strokeWidth={1.8} className="clinical-directional" aria-hidden="true" />
              </button>
            </div>
            <input
              type="date"
              aria-label={copy.datePicker}
              title={copy.datePicker}
              className="h-[42px] rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 text-[.8rem] text-[var(--text-primary)] hover:bg-[var(--surface-muted)]"
              value={toDateInputValue(selectedDate)}
              onChange={(event) => {
                const [year, month, day] = event.target.value.split("-").map(Number);
                if (year && month && day) setSelectedDate(new Date(year, month - 1, day));
              }}
            />
            {isEstablishment ? (
              <Select
                aria-label={copy.doctorFilter}
                title={copy.doctorFilter}
                className="h-[42px] w-auto rounded-[var(--radius-sm)] border-[var(--border)] bg-[var(--surface)] px-3 text-[.8rem] text-[var(--text-primary)] hover:bg-[var(--surface-muted)]"
                value={selectedDoctorId ?? ""}
                onChange={(event) => setSelectedDoctorId(event.target.value || null)}
              >
                <option value="">{copy.allDoctors}</option>
                {(doctors ?? []).map((doctor) => (
                  <option key={doctor.id} value={doctor.id}>{doctor.fullName}</option>
                ))}
              </Select>
            ) : null}
            <button type="button" className="clinical-button clinical-button-primary" onClick={openCreate}>
              <CalendarPlus size={16} strokeWidth={1.8} aria-hidden="true" />
              {copy.new}
            </button>
          </div>
        </header>

        <dl className="operational-metrics">
          <OperationalMetricCard
            label={copy.metrics.total}
            value={metricValue(list.length)}
            hint={hasData ? copy.metrics.totalHint(formatDuration(plannedMinutes)) : "—"}
            icon={CalendarDays}
            tone="medical"
          />
          <OperationalMetricCard
            label={copy.metrics.toConfirm}
            value={metricValue(scheduledCount)}
            hint={hasData ? copy.metrics.toConfirmHint(formatNumber(countByStatus("CONFIRMED"))) : "—"}
            icon={CalendarClock}
            tone={scheduledCount > 0 ? "warning" : "default"}
          />
          <OperationalMetricCard
            label={copy.metrics.completed}
            value={metricValue(countByStatus("COMPLETED"))}
            hint={hasData ? copy.metrics.completedHint : "—"}
            icon={CalendarCheck}
          />
          <OperationalMetricCard
            label={copy.metrics.absences}
            value={metricValue(countByStatus("NO_SHOW") + countByStatus("CANCELED"))}
            hint={hasData ? copy.metrics.absencesHint(formatNumber(countByStatus("NO_SHOW")), formatNumber(countByStatus("CANCELED"))) : "—"}
            icon={CalendarX2}
          />
        </dl>

        <section className="surface-section overflow-hidden" aria-labelledby="agenda-schedule-heading">
          <div className="clinical-section-heading border-b border-[var(--line-soft)]">
            <div>
              <h2 id="agenda-schedule-heading">{copy.schedule.title}</h2>
              <p className="clinical-caption mt-1">{copy.schedule.subtitle[accountType]}</p>
            </div>
            {isEstablishment && hasData && doctorCount > 0 ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
                <Stethoscope size={14} strokeWidth={1.8} aria-hidden="true" />
                {copy.doctorCount(doctorCount, formatNumber(doctorCount))}
              </span>
            ) : null}
          </div>

          {isLoading ? (
            <>
              <p className="sr-only" role="status">{copy.loading}</p>
              <ol aria-hidden="true">
                {Array.from({ length: 4 }, (_, index) => (
                  <li key={index} className={cn("grid grid-cols-[6rem_minmax(0,1fr)_auto] items-center gap-4 px-5 py-4", index > 0 && "border-t border-[var(--line-soft)]")}>
                    <div className="space-y-2"><SkeletonBlock className="h-3.5 w-11" /><SkeletonBlock className="h-2.5 w-16" /></div>
                    <div className="flex items-center gap-3">
                      <SkeletonBlock className="h-9 w-9 shrink-0" />
                      <div className="w-full space-y-2"><SkeletonBlock className="h-3.5 w-2/5" /><SkeletonBlock className="h-2.5 w-1/4" /></div>
                    </div>
                    <SkeletonBlock className="h-6 w-20 rounded-full" />
                  </li>
                ))}
              </ol>
            </>
          ) : isError && isVerificationRequiredError(error) ? (
            <div className="p-5">
              <VerificationRequiredNotice accountType={accountType} t={t} />
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center px-6 py-14 text-center" role="alert">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--danger-soft)] text-[var(--danger-ink)]">
                <TriangleAlert size={22} strokeWidth={1.8} aria-hidden="true" />
              </span>
              <h3 className="mt-4 text-sm font-semibold">{copy.error.title}</h3>
              <p className="clinical-caption mt-1 max-w-sm">{copy.error.description}</p>
              <button type="button" className="clinical-button mt-5" onClick={() => { void refetch(); }}>
                <RotateCcw size={15} strokeWidth={1.8} aria-hidden="true" />
                {copy.error.retry}
              </button>
            </div>
          ) : list.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-14 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--medical-soft)] text-[var(--medical)]">
                <CalendarX2 size={22} strokeWidth={1.8} aria-hidden="true" />
              </span>
              <h3 className="mt-4 text-sm font-semibold">{copy.empty.title}</h3>
              <p className="clinical-caption mt-1 max-w-sm">{copy.empty.description}</p>
              <button type="button" className="clinical-button clinical-button-primary mt-5" onClick={openCreate}>
                <CalendarPlus size={16} strokeWidth={1.8} aria-hidden="true" />
                {copy.new}
              </button>
            </div>
          ) : (
            <ol>
              {list.map((appointment, index) => {
                const presentation = statusPresentation[appointment.status];
                const isCanceled = appointment.status === "CANCELED";
                const startsAt = new Date(appointment.scheduledAt);
                const endsAt = new Date(startsAt.getTime() + appointment.durationMinutes * 60_000);
                const hasTopBorder = index > 0 && index !== nowMarkerIndex;

                return (
                  <Fragment key={appointment.id}>
                    {index === nowMarkerIndex ? nowMarker : null}
                    <li
                      className={cn(
                        "relative grid cursor-pointer grid-cols-[6rem_minmax(0,1fr)] items-center gap-x-4 gap-y-2.5 px-5 py-4 transition hover:bg-[var(--surface-muted)] md:grid-cols-[6rem_minmax(0,1fr)_auto]",
                        hasTopBorder && "border-t border-[var(--line-soft)]",
                      )}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedAppointment(appointment)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelectedAppointment(appointment);
                        }
                      }}
                    >
                      <span aria-hidden="true" className="absolute inset-y-3 start-0 w-[3px] rounded-e-full" style={{ backgroundColor: presentation.rail }} />
                      <div className="self-start leading-tight md:self-center">
                        <p className={cn("text-[.95rem] font-semibold", isCanceled ? "text-[var(--text-secondary)] line-through" : "text-[var(--text-primary)]")}>
                          <time dateTime={appointment.scheduledAt} dir="ltr">{timeFormatter.format(startsAt)}</time>
                        </p>
                        <p className="mt-1 whitespace-nowrap text-xs text-[var(--text-secondary)]">
                          <bdi dir="ltr">{timeFormatter.format(endsAt)}</bdi> · {formatNumber(appointment.durationMinutes)} {copy.duration.minutes}
                        </p>
                      </div>
                      <div className="flex min-w-0 items-center gap-3">
                        <span
                          aria-hidden="true"
                          className={cn(
                            "flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-[.7rem] font-semibold",
                            isCanceled ? "bg-[var(--surface-muted)] text-[var(--text-secondary)]" : "bg-[var(--medical-soft)] text-[var(--medical)]",
                          )}
                        >
                          {getPatientInitials(appointment)}
                        </span>
                        <div className="min-w-0">
                          <p className={cn("truncate text-sm font-semibold", isCanceled ? "text-[var(--text-secondary)]" : "text-[var(--text-primary)]")}>{getPatientName(appointment)}</p>
                          <p className="mt-0.5 truncate text-[.8rem] text-[var(--text-secondary)]">{appointment.reason}</p>
                        </div>
                      </div>
                      {/* Fixed-width tracks on md+ keep doctor names and badges aligned from row to row. */}
                      <div
                        className={cn(
                          "col-start-2 flex flex-wrap items-center gap-x-4 gap-y-2 md:col-start-auto md:grid md:gap-4",
                          isEstablishment ? "md:grid-cols-[11rem_6.5rem]" : "md:grid-cols-[6.5rem]",
                        )}
                      >
                        {isEstablishment ? (
                          <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-[var(--text-secondary)]">
                            <Stethoscope size={14} strokeWidth={1.8} className="shrink-0" aria-hidden="true" />
                            <span className="truncate">{appointment.doctorFullName}</span>
                          </span>
                        ) : null}
                        <div className="md:justify-self-end">
                          <StatusBadge label={copy.statuses[appointment.status]} tone={presentation.tone} />
                        </div>
                      </div>
                    </li>
                  </Fragment>
                );
              })}
              {nowMarkerIndex === list.length ? nowMarker : null}
            </ol>
          )}
        </section>
      </div>

      <div role="status" aria-live="polite">
        {notice ? (
          <div className="surface-raised fixed bottom-6 end-6 z-40 flex items-center gap-2.5 border-[var(--success-line)] px-4 py-3 text-sm font-medium text-[var(--text-primary)]">
            <CircleCheck size={17} strokeWidth={1.8} className="shrink-0 text-[var(--success-ink)]" aria-hidden="true" />
            {notice}
          </div>
        ) : null}
      </div>

      <CreateAppointmentModal
        accountType={accountType}
        defaultDate={toDateInputValue(selectedDate)}
        direction={direction}
        isOpen={isCreateOpen}
        locale={locale}
        onClose={() => setCreateOpen(false)}
        onCreate={() => { setNotice(copy.added); window.setTimeout(() => setNotice(""), 3200); }}
      />

      <AppointmentDetailsModal
        accountType={accountType}
        appointment={selectedAppointment}
        direction={direction}
        locale={locale}
        onClose={() => setSelectedAppointment(null)}
        onUpdated={() => { setNotice(copy.updated); window.setTimeout(() => setNotice(""), 3200); }}
      />
    </DashboardShell>
  );
}
