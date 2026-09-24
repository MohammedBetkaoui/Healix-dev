import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import type { TranslationFunction } from "@/lib/i18n";
import type { DashboardAccountStatusPresentation } from "./account-status-presentation";
import { StatusBadge } from "./StatusBadge";

export function WorkspaceStatus({ status, isError, onRetry, t, verificationHref = "/establishment/verification" }: {
  status: DashboardAccountStatusPresentation;
  isError: boolean;
  onRetry: () => void;
  t: TranslationFunction;
  verificationHref?: "/establishment/verification" | "/doctor/verification";
}) {
  return (
    <section className="workspace-status surface-section" aria-labelledby="workspace-status-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="workspace-status-heading" className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck size={17} strokeWidth={1.8} className="text-[var(--official)]" aria-hidden="true" />{t("dashboard.clinical.account.title")}</h2>
        <span aria-live="polite"><StatusBadge label={isError ? t("dashboard.clinical.account.unavailable") : status.statusLabel} tone={isError ? "neutral" : status.statusTone} /></span>
      </div>
      <p className="clinical-caption mt-3">{status.cardDescription}</p>
      <p className="mt-2 text-[.65rem] text-[var(--text-muted)]">{t("dashboard.clinical.account.source")}</p>
      {isError ? <button type="button" onClick={onRetry} className="clinical-link mt-1">{t("dashboard.clinical.account.retry")}</button> :
        <Link href={verificationHref} className="clinical-link mt-1">{status.actionLabel ?? t("dashboard.clinical.actions.verification")}</Link>}
    </section>
  );
}
