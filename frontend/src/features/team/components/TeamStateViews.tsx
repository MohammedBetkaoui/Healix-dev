import { AlertTriangle, CheckCircle2, RotateCcw } from "lucide-react";
import { type ReactNode } from "react";

import { type TranslationFunction } from "@/lib/i18n";

import { type TeamErrorKey } from "../utils/team-errors";
import { type TeamStatusTone } from "../utils/team-utils";

export function TeamSkeleton({ t }: { t: TranslationFunction }) {
  return (
    <section
      className="space-y-4"
      role="status"
      aria-busy="true"
      aria-label={t("team.states.loading")}
    >
      {[0, 1, 2].map((row) => (
        <span
          key={row}
          className="block h-28 animate-pulse rounded-[var(--radius-md)] bg-[var(--surface-muted)]"
          aria-hidden="true"
        />
      ))}
    </section>
  );
}

export function TeamErrorState({
  errorKey,
  onRetry,
  t,
}: {
  errorKey: TeamErrorKey;
  onRetry: () => void;
  t: TranslationFunction;
}) {
  return (
    <section
      className="flex flex-col items-center rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-6 py-12 text-center"
      role="alert"
    >
      <AlertTriangle
        className="text-[var(--danger-ink)]"
        size={28}
        strokeWidth={1.6}
        aria-hidden="true"
      />
      <h2 className="mt-3 text-sm font-semibold">
        {t("team.states.errorTitle")}
      </h2>
      <p className="mt-1 max-w-md text-xs text-[var(--text-secondary)]">
        {t(`team.errors.${errorKey}`)}
      </p>
      <button type="button" className="clinical-button mt-4" onClick={onRetry}>
        <RotateCcw size={14} strokeWidth={1.8} aria-hidden="true" />
        {t("team.states.retry")}
      </button>
    </section>
  );
}

// The answer to an action, under the section it came from: a success is read
// out politely, a failure at once.
export function InlineMessage({
  message,
  tone,
}: {
  message: string;
  tone: "error" | "success";
}) {
  const Icon = tone === "error" ? AlertTriangle : CheckCircle2;
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={`flex items-start gap-2 rounded-[var(--radius-sm)] border px-3 py-2.5 text-xs leading-relaxed ${tone === "error" ? "border-[var(--danger-line)] bg-[var(--danger-soft)] text-[var(--danger-ink)]" : "border-[var(--success-line)] bg-[var(--success-soft)] text-[var(--success-ink)]"}`}
    >
      <Icon size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
      {message}
    </p>
  );
}

export function SectionCard({
  children,
  count,
  description,
  title,
}: {
  children: ReactNode;
  count?: number;
  description?: string;
  title: string;
}) {
  return (
    <section className="team-section">
      <header className="team-section-heading">
        <h2>
          {title}
          {count !== undefined ? (
            <span className="team-section-count">{count}</span>
          ) : null}
        </h2>
        {description ? <p>{description}</p> : null}
      </header>
      {children}
    </section>
  );
}

const TONE_CLASSES: Record<TeamStatusTone, string> = {
  success:
    "border-[var(--success-line)] bg-[var(--success-soft)] text-[var(--success-ink)]",
  danger:
    "border-[var(--danger-line)] bg-[var(--danger-soft)] text-[var(--danger-ink)]",
  warning:
    "border-[var(--warning-line)] bg-[var(--warning-soft)] text-[var(--warning-ink)]",
  neutral:
    "border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text-secondary)]",
};

// One small pill for a status or a role: coloring comes from the shared tone
// helpers of team-utils.
export function StatusBadge({
  label,
  tone,
  dot = false,
}: {
  label: string;
  tone: TeamStatusTone;
  dot?: boolean;
}) {
  return (
    <span
      className={`team-status-badge inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[0.72rem] font-medium ${TONE_CLASSES[tone]}`}
    >
      {dot ? <span className="team-status-dot" aria-hidden="true" /> : null}
      {label}
    </span>
  );
}
