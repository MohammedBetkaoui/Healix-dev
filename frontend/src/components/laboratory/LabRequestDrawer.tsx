"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Download,
  FileCheck2,
  FlaskConical,
  History,
  Microscope,
  ShieldCheck,
  Stethoscope,
  Syringe,
  UserRound,
  X,
} from "lucide-react";

import { StatusBadge } from "@/components/dashboard/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { laboratoryCopy } from "@/features/laboratory/laboratory.copy";
import {
  type LabLocalizedText,
  type LabRequest,
  type LabRequestStatus,
  type LabResultIndicator,
} from "@/features/laboratory/laboratory.types";
import { type Locale } from "@/i18n";
import { cn } from "@/lib/utils";
import { type DashboardStatusTone } from "@/types/dashboard";

export type LabDrawerAction = "collect" | "nonConforming" | "enterResults" | "validate";

type LabRequestDrawerProps = {
  locale: Locale;
  onAction: (action: LabDrawerAction) => void;
  onClose: () => void;
  onOpenReport: () => void;
  request: LabRequest;
};

const statusTone: Record<LabRequestStatus, DashboardStatusTone> = {
  AVAILABLE: "success",
  COLLECTED: "info",
  IN_ANALYSIS: "info",
  NON_CONFORMING: "danger",
  PRESCRIBED: "neutral",
  RECEIVED: "info",
  TO_COLLECT: "warning",
  TO_VALIDATE: "warning",
  VALIDATED: "success",
};

const resultTone: Record<LabResultIndicator, DashboardStatusTone> = {
  CRITICAL: "danger",
  HIGH: "warning",
  LOW: "warning",
  NORMAL: "success",
};

function localized(value: LabLocalizedText, locale: Locale) {
  return value[locale];
}

function formatDateTime(value: string | null, locale: Locale) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-DZ" : "fr-DZ", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function InfoBlock({ label, children }: { children: React.ReactNode; label: string }) {
  return (
    <div className="rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--panel)] px-3.5 py-3">
      <dt className="text-[0.66rem] font-semibold uppercase tracking-[0.07em] text-[var(--ink-faint)]">{label}</dt>
      <dd className="mt-1.5 text-sm leading-5 text-[var(--ink)]">{children}</dd>
    </div>
  );
}

export function LabRequestDrawer({ locale, onAction, onClose, onOpenReport, request }: LabRequestDrawerProps) {
  const copy = laboratoryCopy[locale];
  const patientName = locale === "ar"
    ? `${request.patient.firstNameAr} ${request.patient.lastNameAr}`
    : `${request.patient.firstName} ${request.patient.lastName}`;
  const secondaryName = locale === "ar"
    ? `${request.patient.firstName} ${request.patient.lastName}`
    : `${request.patient.firstNameAr} ${request.patient.lastNameAr}`;
  const hasCriticalResult = request.results.some((result) => result.indicator === "CRITICAL");
  const conformityLabel = request.sample.conformity === "CONFORMING"
    ? copy.drawer.conforming
    : request.sample.conformity === "NON_CONFORMING"
      ? copy.drawer.nonConforming
      : copy.drawer.pending;
  const conformityTone: DashboardStatusTone = request.sample.conformity === "CONFORMING"
    ? "success"
    : request.sample.conformity === "NON_CONFORMING"
      ? "danger"
      : "warning";
  const canCollect = request.status === "PRESCRIBED" || request.status === "TO_COLLECT";
  const canReportNonConformity = !["AVAILABLE", "VALIDATED", "NON_CONFORMING"].includes(request.status);
  const canEnterResults = ["COLLECTED", "RECEIVED", "IN_ANALYSIS"].includes(request.status);
  const canValidate = request.status === "TO_VALIDATE";
  const canOpenReport = request.status === "VALIDATED" || request.status === "AVAILABLE";

  return (
    <div
      className="fixed inset-0 z-[90] bg-[var(--scrim)]"
      role="presentation"
      onKeyDown={(event) => { if (event.key === "Escape") onClose(); }}
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <aside
        aria-labelledby="lab-drawer-title"
        aria-modal="true"
        className="surface-raised ms-auto flex h-full w-full max-w-5xl flex-col overflow-hidden rounded-none border-y-0 border-e-0"
        role="dialog"
      >
        <header className="shrink-0 border-b border-[var(--line)] bg-[var(--panel)] px-4 py-4 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--medical-soft)] text-[var(--medical)] ring-1 ring-[var(--accent-line)]">
                <FlaskConical className="h-4.5 w-4.5" strokeWidth={1.8} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-[var(--medical)]">{copy.drawer.title}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <h2 id="lab-drawer-title" className="clinical-figure text-lg font-semibold text-[var(--ink)]" dir="ltr">{request.reference}</h2>
                  <StatusBadge label={copy.statuses[request.status]} tone={statusTone[request.status]} />
                  <StatusBadge label={request.priority === "URGENT" ? copy.urgent : copy.routine} tone={request.priority === "URGENT" ? "danger" : "neutral"} />
                </div>
              </div>
            </div>
            <button autoFocus type="button" className="clinical-icon-button shrink-0" onClick={onClose} aria-label={copy.drawer.close}>
              <X className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
            </button>
          </div>
          <p className="mt-3 flex items-center gap-2 text-xs text-[var(--ink-soft)]">
            <ShieldCheck className="h-3.5 w-3.5 text-[var(--medical)]" strokeWidth={1.8} aria-hidden="true" />
            {copy.drawer.confidential}
          </p>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--panel-soft)] p-4 sm:p-6">
          <div className="space-y-5">
            <section className="surface-section overflow-hidden">
              <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <div>
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--medical-soft)] text-xs font-semibold text-[var(--medical)] ring-1 ring-[var(--accent-line)]">
                      {request.patient.firstName.charAt(0)}{request.patient.lastName.charAt(0)}
                    </span>
                    <div>
                      <p className="text-[0.66rem] font-semibold uppercase tracking-[0.08em] text-[var(--ink-faint)]">{copy.drawer.patientIdentity}</p>
                      <h3 className="mt-0.5 font-semibold text-[var(--ink)]">{patientName}</h3>
                      <p className="text-sm text-[var(--ink-soft)]" dir={locale === "ar" ? "ltr" : "rtl"}>{secondaryName}</p>
                    </div>
                  </div>
                  <p className="clinical-figure mt-3 rounded-[var(--radius-xs)] bg-[var(--panel-soft)] px-3 py-2 text-xs text-[var(--ink-soft)]" dir="ltr">
                    {copy.drawer.internalRecord}: {request.patient.internalRecordNumber}
                  </p>
                </div>
                <div className="border-t border-[var(--line)] pt-4 lg:border-s lg:border-t-0 lg:ps-5 lg:pt-0">
                  <p className="text-[0.66rem] font-semibold uppercase tracking-[0.08em] text-[var(--ink-faint)]">{copy.drawer.prescription}</p>
                  <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-[var(--ink)]"><Stethoscope className="h-4 w-4 text-[var(--medical)]" />{localized(request.doctor, locale)}</p>
                  <p className="mt-1.5 text-sm text-[var(--ink-soft)]">{copy.drawer.service}: {localized(request.service, locale)}</p>
                  <p className="mt-1.5 text-sm text-[var(--ink-soft)]">{copy.drawer.category}: {copy.categories[request.category]}</p>
                </div>
              </div>
            </section>

            <section className="surface-section p-5" aria-labelledby="lab-sample-title">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--medical-soft)] text-[var(--medical)]"><Syringe className="h-4 w-4" strokeWidth={1.8} /></span>
                  <h3 id="lab-sample-title" className="text-sm font-semibold text-[var(--ink)]">{copy.drawer.sample}</h3>
                </div>
                <StatusBadge label={conformityLabel} tone={conformityTone} />
              </div>
              <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <InfoBlock label={copy.sampleType}>{localized(request.sample.type, locale)}</InfoBlock>
                <InfoBlock label={copy.drawer.collectedAt}>{formatDateTime(request.sample.collectedAt, locale)}</InfoBlock>
                <InfoBlock label={copy.drawer.collectedBy}>{request.sample.collectedBy ? localized(request.sample.collectedBy, locale) : "—"}</InfoBlock>
                <InfoBlock label={copy.drawer.receivedAt}>{formatDateTime(request.sample.receivedAt, locale)}</InfoBlock>
              </dl>
              {request.sample.conformityComment ? (
                <p className={cn(
                  "mt-3 rounded-[var(--radius-sm)] border px-3.5 py-3 text-sm leading-5",
                  request.sample.conformity === "NON_CONFORMING"
                    ? "border-[var(--danger-line)] bg-[var(--danger-soft)] text-[var(--danger-ink)]"
                    : "border-[var(--line)] bg-[var(--panel-soft)] text-[var(--ink-soft)]",
                )}>
                  {localized(request.sample.conformityComment, locale)}
                </p>
              ) : null}
            </section>

            <section className="surface-section p-5" aria-labelledby="lab-exams-title">
              <div className="mb-4 flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--medical-soft)] text-[var(--medical)]"><Microscope className="h-4 w-4" strokeWidth={1.8} /></span>
                <h3 id="lab-exams-title" className="text-sm font-semibold text-[var(--ink)]">{copy.drawer.exams}</h3>
              </div>
              <ul className="grid gap-2 sm:grid-cols-2">
                {request.exams.map((exam) => (
                  <li key={exam.fr} className="flex items-start gap-2 rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--panel-soft)] px-3 py-2.5 text-sm text-[var(--ink)]">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--medical)]" strokeWidth={1.8} aria-hidden="true" />
                    {localized(exam, locale)}
                  </li>
                ))}
              </ul>
            </section>

            <section className="surface-section overflow-hidden" aria-labelledby="lab-results-title">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-4">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--medical-soft)] text-[var(--medical)]"><FlaskConical className="h-4 w-4" strokeWidth={1.8} /></span>
                  <h3 id="lab-results-title" className="text-sm font-semibold text-[var(--ink)]">{copy.drawer.results}</h3>
                </div>
                {hasCriticalResult ? <StatusBadge label={copy.drawer.critical} tone="danger" /> : null}
              </div>

              {hasCriticalResult ? (
                <div className="flex items-start gap-3 border-b border-[var(--danger-line)] bg-[var(--danger-soft)] px-5 py-3 text-sm text-[var(--danger-ink)]">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.8} aria-hidden="true" />
                  {copy.drawer.criticalNotice}
                </div>
              ) : null}

              {request.results.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] border-collapse text-sm">
                    <thead className="bg-[var(--panel-soft)]">
                      <tr className="border-b border-[var(--line)] text-[0.68rem] font-semibold uppercase tracking-[0.05em] text-[var(--ink-faint)]">
                        <th scope="col" className="px-4 py-3 text-start">{copy.drawer.parameter}</th>
                        <th scope="col" className="px-4 py-3 text-start">{copy.drawer.result}</th>
                        <th scope="col" className="px-4 py-3 text-start">{copy.drawer.unit}</th>
                        <th scope="col" className="px-4 py-3 text-start">{copy.drawer.referenceValues}</th>
                        <th scope="col" className="px-4 py-3 text-start">{copy.drawer.interpretation}</th>
                        <th scope="col" className="px-4 py-3 text-start">{copy.drawer.previous}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--line)]">
                      {request.results.map((result) => {
                        const resultLabel = result.indicator === "CRITICAL"
                          ? copy.drawer.critical
                          : result.indicator === "HIGH"
                            ? copy.drawer.high
                            : result.indicator === "LOW"
                              ? copy.drawer.low
                              : copy.drawer.normal;
                        return (
                          <tr key={result.id} className={cn(result.indicator === "CRITICAL" && "bg-[var(--danger-soft)]")}>
                            <th scope="row" className="px-4 py-3 text-start font-medium text-[var(--ink)]">{localized(result.parameter, locale)}</th>
                            <td className={cn("clinical-figure px-4 py-3 font-semibold", result.indicator === "CRITICAL" ? "text-[var(--danger-ink)]" : "text-[var(--ink)]")} dir="ltr">{result.value}</td>
                            <td className="clinical-figure px-4 py-3 text-[var(--ink-soft)]" dir="ltr">{result.unit}</td>
                            <td className="clinical-figure px-4 py-3 text-[var(--ink-soft)]" dir="ltr">{result.reference}</td>
                            <td className="px-4 py-3"><StatusBadge label={resultLabel} tone={resultTone[result.indicator]} /></td>
                            <td className="px-4 py-3 text-xs text-[var(--ink-soft)]">
                              {result.previous ? <><span dir="ltr">{result.previous.value}</span><span className="mt-0.5 block text-[var(--ink-faint)]">{formatDateTime(result.previous.date, locale)}</span></> : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="px-5 py-10 text-center text-sm text-[var(--ink-faint)]">{copy.drawer.noResults}</div>
              )}
            </section>

            <section className="grid gap-4 lg:grid-cols-2">
              <div className="surface-section p-5">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--ink)]"><UserRound className="h-4 w-4 text-[var(--medical)]" />{copy.drawer.labComment}</h3>
                <p className="mt-3 text-sm leading-6 text-[var(--ink-soft)]">{request.labComment ? localized(request.labComment, locale) : "—"}</p>
                <dl className="mt-4 border-t border-[var(--line)] pt-4">
                  <dt className="text-xs text-[var(--ink-faint)]">{copy.drawer.enteredBy}</dt>
                  <dd className="mt-1 text-sm font-medium text-[var(--ink)]">{request.enteredBy ? localized(request.enteredBy, locale) : "—"}</dd>
                </dl>
              </div>
              <div className="surface-section p-5">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--ink)]"><FileCheck2 className="h-4 w-4 text-[var(--medical)]" />{copy.drawer.finalValidation}</h3>
                {request.validation ? (
                  <div className="mt-3 rounded-[var(--radius-sm)] border border-[var(--success-line)] bg-[var(--success-soft)] p-3.5">
                    <p className="text-sm font-semibold text-[var(--success-ink)]">{localized(request.validation.practitioner, locale)}</p>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-[var(--ink-soft)]"><Clock3 className="h-3.5 w-3.5" />{formatDateTime(request.validation.date, locale)}</p>
                  </div>
                ) : (
                  <p className="mt-3 rounded-[var(--radius-sm)] border border-[var(--warning-line)] bg-[var(--warning-soft)] px-3.5 py-3 text-sm text-[var(--warning-ink)]">{copy.drawer.notValidated}</p>
                )}
              </div>
            </section>

            <section className="surface-section p-5" aria-labelledby="lab-trace-title">
              <div className="mb-4 flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--medical-soft)] text-[var(--medical)]"><History className="h-4 w-4" /></span>
                <h3 id="lab-trace-title" className="text-sm font-semibold text-[var(--ink)]">{copy.drawer.traceability}</h3>
              </div>
              <ol className="divide-y divide-[var(--line)] rounded-[var(--radius-md)] border border-[var(--line)]">
                {request.trace.map((event) => (
                  <li key={event.id} className="grid gap-2 p-4 sm:grid-cols-[10rem_minmax(0,1fr)]">
                    <time className="clinical-figure text-xs text-[var(--ink-faint)]" dateTime={event.date}>{formatDateTime(event.date, locale)}</time>
                    <div>
                      <p className="text-sm font-semibold text-[var(--ink)]">{localized(event.title, locale)}</p>
                      <p className="mt-1 text-sm text-[var(--ink-soft)]">{localized(event.detail, locale)}</p>
                      <p className="mt-1.5 text-xs font-medium text-[var(--medical)]">{localized(event.actor, locale)}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        </div>

        <footer className="shrink-0 border-t border-[var(--line)] bg-[var(--panel)] p-3 sm:px-6 sm:py-4">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={!canCollect} onClick={() => onAction("collect")}><Syringe className="h-4 w-4" />{copy.drawer.registerSample}</Button>
            <Button size="sm" variant="outline" disabled={!canReportNonConformity} className="disabled:opacity-45" onClick={() => onAction("nonConforming")}><AlertTriangle className="h-4 w-4" />{copy.drawer.reportNonConformity}</Button>
            <Button size="sm" variant="outline" disabled={!canEnterResults} onClick={() => onAction("enterResults")}><Microscope className="h-4 w-4" />{copy.drawer.enterResults}</Button>
            <Button size="sm" disabled={!canValidate} onClick={() => onAction("validate")}><FileCheck2 className="h-4 w-4" />{copy.drawer.validateReport}</Button>
            <Button size="sm" variant="secondary" disabled={!canOpenReport} onClick={onOpenReport}><Download className="h-4 w-4" />{copy.drawer.viewPdf}</Button>
          </div>
        </footer>
      </aside>
    </div>
  );
}
