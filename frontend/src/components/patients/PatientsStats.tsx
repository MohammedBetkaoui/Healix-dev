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
    <article className="rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-[0_12px_36px_rgba(15,23,42,0.04)]">
      <div className="flex items-start justify-between gap-4">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-50 text-[#0b3b5f] ring-1 ring-slate-200">
          <Icon className="h-5 w-5" />
        </span>
        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
          {item.trend}
        </span>
      </div>
      <p className="mt-5 text-3xl font-semibold tracking-tight text-slate-950">
        {item.value}
      </p>
      <h3 className="mt-2 text-sm font-semibold text-slate-700">{item.title}</h3>
      <p className="mt-1 text-sm text-slate-500">{item.description}</p>
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
