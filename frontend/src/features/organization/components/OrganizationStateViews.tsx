import { AlertTriangle, CheckCircle2, RotateCcw } from "lucide-react";
import { type ReactNode } from "react";

import { type TranslationFunction } from "@/lib/i18n";

import { type OrganizationErrorKey } from "../utils/organization-errors";

export function OrganizationSkeleton({ t }: { t: TranslationFunction }) {
  return (
    <section
      className="space-y-4"
      role="status"
      aria-busy="true"
      aria-label={t("organization.states.loading")}
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

export function OrganizationErrorState({
  errorKey,
  onRetry,
  t,
}: {
  errorKey: OrganizationErrorKey;
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
        {t("organization.states.errorTitle")}
      </h2>
      <p className="mt-1 max-w-md text-xs text-[var(--text-secondary)]">
        {t(`organization.errors.${errorKey}`)}
      </p>
      <button type="button" className="clinical-button mt-4" onClick={onRetry}>
        <RotateCcw size={14} strokeWidth={1.8} aria-hidden="true" />
        {t("organization.states.retry")}
      </button>
    </section>
  );
}

// The answer to an action, under the form it comes from: a success is read
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
  description,
  title,
}: {
  children: ReactNode;
  description?: string;
  title: string;
}) {
  return (
    <section className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-5">
      <h2 className="text-sm font-semibold text-[var(--text-primary)]">
        {title}
      </h2>
      {description ? (
        <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
          {description}
        </p>
      ) : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}
