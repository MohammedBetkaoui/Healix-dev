import type { LucideIcon } from "lucide-react";

export function OperationalMetricCard({ label, value, denominator, hint, icon: Icon, tone = "default" }: {
  label: string; value: string; denominator?: string; hint: string; icon: LucideIcon; tone?: "default" | "medical" | "warning";
}) {
  return (
    <div className="operational-metric" data-tone={tone}>
      <dt className="flex items-center justify-between gap-2 text-xs font-medium text-[var(--text-secondary)]">
        {label}<Icon size={17} strokeWidth={1.8} aria-hidden="true" className="shrink-0" />
      </dt>
      <dd className="mt-3">
        <bdi dir="ltr">
          <span className="metric-value">{value}</span>
          {denominator ? <span className="ms-1.5 text-base text-[var(--text-secondary)]">/ {denominator}</span> : null}
        </bdi>
        <p className="clinical-caption mt-1.5">{hint}</p>
      </dd>
    </div>
  );
}
