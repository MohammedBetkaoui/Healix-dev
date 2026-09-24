import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  type DashboardActivityColumn,
  type DashboardActivityRow,
} from "@/types/dashboard";

import { StatusBadge } from "./StatusBadge";

type ActivityTableProps = {
  columns: DashboardActivityColumn[];
  rows: DashboardActivityRow[];
  title: string;
  subtitle?: string;
};

export function ActivityTable({
  columns,
  rows,
  title,
  subtitle,
}: ActivityTableProps) {
  return (
    <section className="clinical-table min-w-0 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]/94 shadow-sm">
      <div className="border-b border-[var(--line-soft)] px-6 py-5">
        <h2 className="font-[var(--font-auth-display)] text-[1.2rem] font-medium text-[var(--ink)]">{title}</h2>
        {subtitle ? <p className="mt-1 text-xs text-[var(--ink-soft)]">{subtitle}</p> : null}
      </div>
      <div className="overflow-x-auto" role="region" aria-label={title} tabIndex={0}>
        <table className="min-w-full text-sm">
          <caption className="sr-only">{title}</caption>
          <thead>
            <tr className="text-start font-[var(--font-auth-mono)] text-[0.66rem] uppercase tracking-[0.14em] text-[var(--ink-faint)]">
              {columns.map((column) => (
                <th key={column.key} scope="col" className="px-6 py-4 font-medium">
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className="border-t border-[var(--line-soft)] text-[var(--ink-soft)] transition hover:bg-[var(--panel-soft)]/70"
              >
                {columns.map((column) => (
                  <td
                    key={`${row.id}-${column.key}`}
                    className={cn(
                      "px-6 py-4 align-middle",
                      column.key === "status" && "min-w-[120px]",
                    )}
                  >
                    {column.key === "type" || column.key === "action" ? (
                      <span className="font-medium text-[var(--ink)]">
                        {row.typeOrAction}
                      </span>
                    ) : null}
                    {column.key === "patient" ? row.patient : null}
                    {column.key === "date" ? row.date : null}
                    {column.key === "status" ? (
                      <StatusBadge
                        label={row.statusLabel}
                        tone={row.statusTone}
                      />
                    ) : null}
                    {column.key === "cta" ? (
                      <div className="flex items-center justify-between gap-2">
                        {row.actionLabel && row.actionHref ? (
                          <Link href={row.actionHref} className="inline-flex min-h-10 items-center px-3 text-xs text-[var(--accent-dark)]">
                            {row.actionLabel}
                          </Link>
                        ) : null}
                      </div>
                    ) : null}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
