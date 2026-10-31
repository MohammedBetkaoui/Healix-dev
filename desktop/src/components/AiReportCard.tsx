import type { CSSProperties } from "react";
import { Activity, Brain, ExternalLink, HeartPulse, Info, Microscope, Sparkles, type LucideIcon } from "lucide-react";
import {
  ESC_SOURCE, LVEF_CLASS_LABEL, classTitle, conclusionOf, decidedOn, formatNumber, formatPercent, lvefClass, measureLines,
  proposalOf, specialtyColor, specialtyOf, type Specialty,
} from "../ai-reports";
import { Button, ListState, Notice, StatusBadge, cn } from "../dashboard-ui";
import { capitalize } from "../dates";
import { fr } from "../i18n/fr";
import type { AiReport } from "../types";
import { WEB_APP_URL } from "../web-app";

const SPECIALTY_ICON: Record<Specialty, LucideIcon> = { brain: Brain, pathology: Microscope, cardiology: HeartPulse };

// The sentence of the Web platform, always in view where AI results are shown.
export function AiDisclaimer() {
  return (
    <Notice icon={<Info className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.8} aria-hidden="true" />}>
      <span data-ai-disclaimer="">{fr.ai.disclaimer}</span>
    </Notice>
  );
}

const pill = "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.7rem] font-semibold";
const lvefTones = {
  danger: "border-[var(--danger-line)] bg-[var(--danger-soft)] text-[var(--danger-ink)]",
  warning: "border-[var(--warning-line)] bg-[var(--warning-soft)] text-[var(--warning-ink)]",
  success: "border-[var(--success-line)] bg-[var(--success-soft)] text-[var(--success-ink)]",
} as const;

function Trace({ report }: { report: AiReport }) {
  const model = (id: string | null, sha: string | null) =>
    id ? `${id}${sha ? ` · ${fr.ai.weights} ${sha}` : ""}` : null;
  const lines = [
    [fr.ai.model, model(report.classificationModelId, report.classificationWeightsSha12)],
    [fr.ai.segmentation, model(report.segmentationModelId, report.segmentationWeightsSha12)],
    [fr.ai.decidedBy, report.decidedByName],
    [fr.ai.report, report.reportNumber],
  ].filter((line): line is [string, string] => Boolean(line[1]));
  if (!lines.length) return null;
  return (
    <dl className="flex flex-wrap gap-x-6 gap-y-1 text-[0.68rem] text-[var(--ink-faint)]" aria-label={fr.ai.traceability}>
      {lines.map(([label, value]) => (
        <div key={label} className="flex gap-1.5">
          <dt className="font-medium">{label}</dt>
          <dd className="clinical-figure text-[var(--ink-soft)]">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

// One validated or corrected analysis: the physician's conclusion first, then,
// quieter, what the model proposed, the key figures and where the answer came from.
export function AiReportCard({ report, offline, onOpenRun }: {
  report: AiReport;
  offline: boolean;
  onOpenRun: (runId: string) => void;
}) {
  const specialty = specialtyOf(report.pipeline);
  const Icon = SPECIALTY_ICON[specialty] ?? Activity;
  const lines = measureLines(report);
  const ef = report.pipeline === "cardio-volume-mri" ? lvefClass(report.measures.lvef) : null;
  const proposal = proposalOf(report);
  const conclusion = conclusionOf(report);
  // The class has its own pill: the headline of a volumetry is the figure itself.
  const lvef = report.measures.lvef;
  const headline = ef && lvef !== null && lvef !== undefined ? `FEVG ${formatNumber(lvef)} %` : capitalize(conclusion);
  const style = { "--ai-module-color": specialtyColor(specialty) } as CSSProperties;

  return (
    <article
      className="surface-section overflow-hidden border-t-2 border-t-[var(--ai-module-color)] p-5"
      style={style}
      data-pipeline={report.pipeline}
      data-specialty={specialty}
      aria-label={`${report.moduleLabel}, ${decidedOn(report)}`}
    >
      <header className="flex flex-wrap items-center gap-3">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--panel-soft)] text-[var(--ai-module-color)]"
          aria-hidden="true"
        >
          <Icon className="h-4 w-4" strokeWidth={1.8} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-[var(--ink)]">{report.moduleLabel}</h3>
          <p className="text-xs text-[var(--ink-faint)]">{fr.ai.decidedOn} {decidedOn(report)}</p>
        </div>
        <StatusBadge label={fr.ai.decisions[report.decisionStatus] ?? report.decisionStatus} tone={report.decisionStatus === "CORRECTED" ? "warning" : "success"} />
      </header>

      <section className="mt-4" aria-label={fr.ai.conclusion} data-conclusion="">
        <p className="text-[0.7rem] font-semibold uppercase tracking-wide text-[var(--ink-faint)]">{fr.ai.conclusion}</p>
        <p className="mt-1 text-base font-semibold text-[var(--ink)]">
          {headline}
        </p>
        {ef ? (
          <p className="mt-2">
            <span className={cn(pill, lvefTones[LVEF_CLASS_LABEL[ef].tone])} data-lvef-class={ef}>
              {LVEF_CLASS_LABEL[ef].text} ({LVEF_CLASS_LABEL[ef].range})
            </span>
          </p>
        ) : null}
        {report.clinicianImpression ? (
          <p className="mt-2 whitespace-pre-line text-sm leading-6 text-[var(--ink)]">{report.clinicianImpression}</p>
        ) : null}
      </section>

      {proposal || report.topPredictions.length ? (
        <section className="mt-4 border-t border-[var(--line)] pt-3" aria-label={fr.ai.modelProposal} data-model-proposal="">
          <p className="text-[0.7rem] font-semibold text-[var(--ink-faint)]">{fr.ai.modelProposal}</p>
          {proposal ? <p className="mt-0.5 text-xs text-[var(--ink-soft)]">{capitalize(proposal)}</p> : null}
          {report.topPredictions.length ? (
            <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--ink-faint)]">
              {report.topPredictions.map((prediction) => (
                <li key={prediction.label}>
                  {classTitle(prediction.label)} <span className="clinical-figure text-[var(--ink-soft)]">{formatPercent(prediction.probability)}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {lines.length ? (
        <section className="mt-4 border-t border-[var(--line)] pt-3" aria-label={fr.ai.measures}>
          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
            {lines.map((line) => (
              <div key={line.label} className="min-w-0">
                <dt className="text-[0.68rem] text-[var(--ink-faint)]">{line.label}</dt>
                <dd className="clinical-figure text-sm font-semibold text-[var(--ink)]">
                  {line.value}
                  {line.note ? <span className="ms-1.5 text-[0.68rem] font-normal text-[var(--ink-faint)]">{line.note}</span> : null}
                </dd>
              </div>
            ))}
          </dl>
          {ef ? <p className="mt-2 text-[0.68rem] text-[var(--ink-faint)]">{ESC_SOURCE}</p> : null}
        </section>
      ) : null}

      <footer className="mt-4 flex flex-wrap items-end justify-between gap-3 border-t border-[var(--line)] pt-3">
        <Trace report={report} />
        {WEB_APP_URL ? (
          <Button variant="outline" size="sm" disabled={offline} title={offline ? fr.ai.openRunOffline : undefined} onClick={() => onOpenRun(report.runId)}>
            <ExternalLink className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
            {fr.ai.openRun}
          </Button>
        ) : null}
      </footer>
    </article>
  );
}

// The "Analyses IA" tab of a record: the permanent mention, then one card per
// analysis, or the empty state with the way to Healix AI.
export function AiReportsPanel({ reports, loading, error, offline, onOpenRun, onOpenHealixAi }: {
  reports: AiReport[];
  loading: boolean;
  error: string | null;
  offline: boolean;
  onOpenRun: (runId: string) => void;
  onOpenHealixAi: () => void;
}) {
  return (
    <div className="space-y-4 p-5 sm:p-6" data-ai-panel="">
      <AiDisclaimer />
      <ListState
        loading={loading}
        error={error}
        empty={reports.length === 0}
        emptyIcon={Sparkles}
        emptyTitle={fr.ai.emptyTitle}
        emptyText={fr.ai.emptyText}
      >
        <div className="space-y-4">
          {reports.map((report) => (
            <AiReportCard key={report.runId} report={report} offline={offline} onOpenRun={onOpenRun} />
          ))}
        </div>
      </ListState>
      {!loading && !error && reports.length === 0 && WEB_APP_URL ? (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" disabled={offline} title={offline ? fr.common.webOffline : undefined} onClick={onOpenHealixAi}>
            <ExternalLink className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
            {fr.ai.openHealixAi}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
