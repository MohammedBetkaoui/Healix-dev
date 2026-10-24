"use client";

import { ArrowRight, ListChecks, ShieldAlert } from "lucide-react";
import Link from "next/link";

import { PriorityBadge } from "@/components/ai-analyses/PriorityBadge";
import { useAiRunsOverview } from "@/features/ai-analyses/hooks/use-ai-runs-overview";
import { PRIORITY_CARD_SIZE, priorityQueue, waitingAge } from "@/features/ai-analyses/ai-priority";
import { analysisHref, patientName, type RoleBase } from "@/features/dashboard/dashboard-overview";
import { type Locale } from "@/i18n";
import type { TranslationFunction } from "@/lib/i18n";

import { StatusBadge } from "./StatusBadge";

// The first runs waiting for a decision in reading order. Asked for the
// PRIORITY_CARD_SIZE first: when fewer are suspicious the rest of them are
// runs to read in their turn, which the card does not list.
export const PRIORITY_CARD_PARAMS = { decision: "pending", limit: PRIORITY_CARD_SIZE, page: 1, sort: "priority" } as const;

type AiPriorityCardProps = {
  formatNumber: (value: number) => string;
  locale: Locale;
  roleBase: RoleBase;
  t: TranslationFunction;
  /** From the overview: the waiting runs ranked URGENT, whatever their age. */
  urgentPending: number;
};

// "À revoir en priorité": the analyses the model itself finds suspicious and
// that no physician has reviewed yet. An order of reading, not a diagnosis.
export function AiPriorityCard({ formatNumber, locale, roleBase, t, urgentPending }: AiPriorityCardProps) {
  const query = useAiRunsOverview(PRIORITY_CARD_PARAMS);
  const queue = priorityQueue(query.data?.items ?? []);
  const now = new Date();

  return (
    <section className="surface-section overflow-hidden" aria-labelledby="ai-priority-heading" data-urgent={urgentPending}>
      <div className="clinical-section-heading">
        <div className="min-w-0">
          <h2 id="ai-priority-heading" className="flex items-center gap-2">
            <ShieldAlert size={18} strokeWidth={1.8} aria-hidden="true" className="text-[var(--danger-ink)]" />
            {t("aiAnalyses.priority.card.title")}
          </h2>
          <p className="clinical-caption mt-1">{t("aiAnalyses.priority.card.subtitle")}</p>
        </div>
        {urgentPending > 0 ? (
          <StatusBadge label={t("aiAnalyses.priority.card.urgentCount", { count: formatNumber(urgentPending) })} tone="danger" />
        ) : (
          <span className="clinical-caption shrink-0">{t("aiAnalyses.priority.card.urgentNone")}</span>
        )}
      </div>

      <p role="note" className="border-y border-[var(--line-soft)] bg-[var(--panel-soft)] px-5 py-2 text-xs leading-5 text-[var(--ink-soft)]">
        {t("aiAnalyses.priority.disclaimer")}
      </p>

      {query.isError ? (
        <p role="alert" className="px-5 py-4 text-sm text-[var(--danger-ink)]">{t("aiAnalyses.priority.card.error")}</p>
      ) : query.isPending ? (
        <p className="px-5 py-4 text-sm text-[var(--ink-soft)]" aria-live="polite">{t("aiAnalyses.priority.card.loading")}</p>
      ) : queue.length === 0 ? (
        <p className="px-5 py-4 text-sm text-[var(--ink-soft)]">{t("aiAnalyses.priority.card.empty")}</p>
      ) : (
        <ol className="divide-y divide-[var(--line-soft)]">
          {queue.map((run) => {
            const name = patientName(run.patient, locale);
            const age = waitingAge(run.createdAt, now);
            return (
              <li key={run.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
                <PriorityBadge locale={locale} priority={run.priority} t={t} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[var(--ink)]"><bdi>{name}</bdi></p>
                  <p className="clinical-caption">
                    {t(`aiAnalyses.pipelines.${run.pipeline}.name`)} ·{" "}
                    {age.unit === "days"
                      ? t("aiAnalyses.priority.card.waitingDays", { count: formatNumber(age.value) })
                      : t("aiAnalyses.priority.card.waitingHours", { count: formatNumber(age.value) })}
                  </p>
                </div>
                <Link
                  href={analysisHref(roleBase, { id: run.id, patient: { id: run.patientId } })}
                  className="inline-flex min-h-10 items-center px-3 text-xs font-medium text-[var(--accent-dark)]"
                  aria-label={t("aiAnalyses.priority.card.openFor", { patient: name })}
                >
                  {t("aiAnalyses.priority.card.open")}
                </Link>
              </li>
            );
          })}
        </ol>
      )}

      <div className="border-t border-[var(--line-soft)] px-5 py-3">
        <Link href={`${roleBase}/ai-analyses/tracking`} className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--accent-dark)]">
          <ListChecks size={14} strokeWidth={1.8} aria-hidden="true" />
          {t("aiAnalyses.priority.card.viewAll")}
          <ArrowRight size={14} strokeWidth={1.8} aria-hidden="true" className="clinical-directional" />
        </Link>
      </div>
    </section>
  );
}
