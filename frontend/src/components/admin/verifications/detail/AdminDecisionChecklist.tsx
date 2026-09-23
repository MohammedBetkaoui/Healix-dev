"use client";

import { useState } from "react";

import { type TranslationFunction } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type AdminDecisionChecklistProps = {
  t: TranslationFunction;
};

const checklistItems = [
  "identity",
  "documents",
  "fiscal",
  "professional",
  "address",
  "noIssue",
] as const;

type ChecklistValue = "valid" | "review" | "problem";

export function AdminDecisionChecklist({ t }: AdminDecisionChecklistProps) {
  const [values, setValues] = useState<Record<string, ChecklistValue>>(
    Object.fromEntries(checklistItems.map((item) => [item, "review"])),
  );

  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-foreground">
        {t("admin.detail.checklist.title")}
      </h2>
      <div className="mt-5 space-y-3">
        {checklistItems.map((item) => (
          <div
            key={item}
            className="flex flex-col gap-3 rounded-xl border border-border bg-muted p-4 md:flex-row md:items-center md:justify-between"
          >
            <p className="text-sm font-medium text-foreground">
              {t(`admin.detail.checklist.${item}`)}
            </p>
            <div className="flex flex-wrap gap-2">
              {(["valid", "review", "problem"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                    values[item] === value
                      ? "border-primary bg-primary text-white"
                      : "border-border bg-card text-muted-foreground hover:border-[var(--accent-line)]",
                  )}
                  onClick={() => setValues({ ...values, [item]: value })}
                >
                  {t(`admin.detail.checklist.${value}`)}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
