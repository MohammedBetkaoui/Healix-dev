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
    <section className="rounded-[26px] border border-slate-200/80 bg-white shadow-[0_12px_36px_rgba(15,23,42,0.04)]">
      <div className="border-b border-slate-100 px-6 py-5">
        <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-[0.14em] text-slate-400">
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
                className="border-t border-slate-100 text-slate-600"
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
                      <span className="font-medium text-slate-950">
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
                            className="h-8 rounded-full px-3 text-xs"
                          >
                            {row.actionLabel}
                          </Button>
                        ) : null}
                        <button
                          type="button"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                          aria-label="More"
                        >
                          <MoreHorizontal className="h-4 w-4" />
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
