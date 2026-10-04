"use client";

import { UsersRound } from "lucide-react";
import { memo } from "react";

import { type TranslationFunction } from "@/lib/i18n";

type PatientsStatsProps = {
  // meta.total from GET /admin/patients. No backend aggregate exists yet for
  // new patients, consultations or AI analyses, so those cards were removed.
  total: number;
  t: TranslationFunction;
};

export const PatientsStats = memo(function PatientsStats({
  total,
  t,
}: PatientsStatsProps) {
  return (
    <section className="flex items-center gap-4 rounded-xl border border-border/80 bg-card p-5 shadow-sm">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-muted text-[var(--accent-dark)] ring-1 ring-border">
        <UsersRound className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="text-3xl font-semibold tracking-tight text-foreground">{total}</p>
        <h3 className="mt-1 text-sm font-semibold text-foreground">{t("patients.stats.total.title")}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{t("patients.stats.total.description")}</p>
      </div>
    </section>
  );
});
