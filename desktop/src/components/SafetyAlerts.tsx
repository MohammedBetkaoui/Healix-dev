import { ShieldAlert } from "lucide-react";
import { StatusBadge, cn, type StatusTone } from "../dashboard-ui";
import { fr } from "../i18n/fr";
import { bySeverity, type SafetyAlert } from "../prescription-safety";

const tone = (alert: SafetyAlert): StatusTone =>
  alert.level === "critical" ? "danger" : alert.level === "attention" ? "warning" : "info";

const levelText = { critical: "Critique", attention: "Attention", information: "Information" } as const;

// The alerts of one line, under the medication they are about.
export function ItemAlerts({ alerts }: { alerts: SafetyAlert[] }) {
  if (!alerts.length) return null;
  return (
    <ul className="space-y-2" aria-label="Alertes de cette ligne" data-item-alerts="">
      {bySeverity(alerts).map((alert) => (
        <li key={alert.id} data-alert-kind={alert.kind} className="flex flex-wrap items-start gap-2 text-xs text-[var(--ink)]">
          {/* The level is written: the colour only repeats it. */}
          <StatusBadge label={levelText[alert.level]} tone={tone(alert)} />
          <span className="min-w-0 flex-1">
            <strong className="font-semibold">{alert.title}</strong>
            {alert.detail ? <span className="block text-[var(--ink-soft)]">{alert.detail}</span> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

// The summary at the top of the editor: all the alerts, with the line each is about.
export function SafetySummary({ alerts }: { alerts: SafetyAlert[] }) {
  return (
    <section
      aria-label={fr.safety.title}
      data-safety-summary=""
      className={cn(
        "rounded-[var(--radius-md)] border px-5 py-4",
        alerts.some((alert) => alert.level === "critical")
          ? "border-[var(--danger-line)] bg-[var(--danger-soft)]"
          : alerts.length
            ? "border-[var(--warning-line)] bg-[var(--warning-soft)]"
            : "border-[var(--line)] bg-[var(--panel-soft)]",
      )}
    >
      <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--ink)]">
        <ShieldAlert className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
        {fr.safety.title}
        {alerts.length ? <span className="font-normal text-[var(--ink-soft)]">— {fr.safety.summary(alerts.length)}</span> : null}
      </h2>
      {alerts.length ? (
        <ul className="mt-3 space-y-2">
          {bySeverity(alerts).map((alert) => (
            <li key={alert.id} className="flex flex-wrap items-start gap-2 text-xs text-[var(--ink)]">
              <StatusBadge label={levelText[alert.level]} tone={tone(alert)} />
              <span className="min-w-0 flex-1">
                {alert.itemIndex !== undefined ? <span className="clinical-figure me-1 text-[var(--ink-soft)]">{fr.safety.line(alert.itemIndex)} ·</span> : null}
                {alert.title}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-[var(--ink-soft)]">{fr.safety.none}</p>
      )}
      <p className="mt-3 text-[0.68rem] text-[var(--ink-faint)]">{fr.safety.notEvaluated}</p>
    </section>
  );
}
