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
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-950">
        {t("admin.detail.checklist.title")}
      </h2>
      <div className="mt-5 space-y-3">
        {checklistItems.map((item) => (
          <div
            key={item}
            className="flex flex-col gap-3 rounded-xl border border-slate-100 bg-slate-50 p-4 md:flex-row md:items-center md:justify-between"
          >
            <p className="text-sm font-medium text-slate-800">
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
                      ? "border-[#0b3b5f] bg-[#0b3b5f] text-white"
                      : "border-slate-200 bg-white text-slate-600 hover:border-cyan-200",
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
