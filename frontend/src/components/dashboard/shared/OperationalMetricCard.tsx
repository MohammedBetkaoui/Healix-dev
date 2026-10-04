import type { LucideIcon } from "lucide-react";

import { DemoBadge } from "./DemoBadge";

export function OperationalMetricCard({ label, value, denominator, hint, icon: Icon, tone = "default", demoBadgeLabel }: {
  label: string; value: string; denominator?: string; hint: string; icon: LucideIcon; tone?: "default" | "medical" | "warning" | "ai"; demoBadgeLabel?: string;
}) {
  return (
    <div className="operational-metric" data-tone={tone}>
      <dt className="flex items-center justify-between gap-2 text-xs font-medium text-[var(--text-secondary)]">
        <span className="flex min-w-0 flex-wrap items-center gap-1.5">
          {label}
          {demoBadgeLabel ? <DemoBadge label={demoBadgeLabel} /> : null}
        </span>
        <Icon size={17} strokeWidth={1.8} aria-hidden="true" className="shrink-0" />
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
