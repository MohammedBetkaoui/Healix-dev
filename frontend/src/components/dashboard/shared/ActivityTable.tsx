import { MoreHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
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
};

export function ActivityTable({
  columns,
  rows,
  title,
}: ActivityTableProps) {
  return (
    <section className="overflow-hidden rounded-[1rem] rounded-bl-[0.4rem] border border-[var(--line)] bg-[var(--panel)]/94 shadow-[0_1px_2px_rgba(22,33,29,0.03),0_18px_40px_-28px_rgba(22,33,29,0.25)]">
      <div className="border-b border-[var(--line-soft)] px-6 py-5">
        <h2 className="font-[var(--font-auth-display)] text-[1.2rem] font-medium text-[var(--ink)]">{title}</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-start font-[var(--font-auth-mono)] text-[0.66rem] uppercase tracking-[0.14em] text-[var(--ink-faint)]">
              {columns.map((column) => (
                <th key={column.key} className="px-6 py-4 font-medium">
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
                        {row.actionLabel ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 rounded-full px-3 text-xs text-[var(--accent-dark)]"
                          >
                            {row.actionLabel}
                          </Button>
                        ) : null}
                        <button
                          type="button"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--ink-faint)] transition hover:bg-[var(--accent-soft)] hover:text-[var(--accent-dark)]"
                          aria-label="More"
                        >
                          <MoreHorizontal className="h-4 w-4" strokeWidth={1.7} />
                        </button>
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
