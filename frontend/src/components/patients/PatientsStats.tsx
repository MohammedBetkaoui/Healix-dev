"use client";

import {
  Activity,
  BrainCircuit,
  CalendarCheck,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { memo, useMemo } from "react";

import { type TranslationFunction } from "@/lib/i18n";
import { type Patient } from "@/types/patient";

type PatientStatItem = {
  description: string;
  icon: LucideIcon;
  key: string;
  title: string;
  trend: string;
  value: string;
};

type PatientsStatsProps = {
  patients: Patient[];
  t: TranslationFunction;
};

function StatItem({ item }: { item: PatientStatItem }) {
  const Icon = item.icon;

  return (
    <article className="rounded-xl border border-border/80 bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-[var(--accent-dark)] ring-1 ring-border">
          <Icon className="h-5 w-5" />
        </span>
        <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-[var(--accent-dark)]">
          {item.trend}
        </span>
      </div>
      <p className="mt-5 text-3xl font-semibold tracking-tight text-foreground">
        {item.value}
      </p>
      <h3 className="mt-2 text-sm font-semibold text-foreground">{item.title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
    </article>
  );
}

export const PatientsStats = memo(function PatientsStats({
  patients,
  t,
}: PatientsStatsProps) {
  const items = useMemo<PatientStatItem[]>(
    () => [
      {
        description: t("patients.stats.total.description"),
        icon: UsersRound,
        key: "total",
        title: t("patients.stats.total.title"),
        trend: t("patients.stats.total.trend"),
        value: "2450",
      },
      {
        description: t("patients.stats.newThisMonth.description"),
        icon: Activity,
        key: "new",
        title: t("patients.stats.newThisMonth.title"),
        trend: t("patients.stats.newThisMonth.trend"),
        value: "+120",
      },
      {
        description: t("patients.stats.consultations.description"),
        icon: CalendarCheck,
        key: "consultations",
        title: t("patients.stats.consultations.title"),
        trend: t("patients.stats.consultations.trend"),
        value: "850",
      },
      {
        description: t("patients.stats.aiAnalyses.description"),
        icon: BrainCircuit,
        key: "ai",
        title: t("patients.stats.aiAnalyses.title"),
        trend: t("patients.stats.aiAnalyses.trend"),
        value: String(Math.max(320, patients.length * 16)),
      },
    ],
    [patients.length, t],
  );

  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <StatItem key={item.key} item={item} />
      ))}
    </section>
  );
});
