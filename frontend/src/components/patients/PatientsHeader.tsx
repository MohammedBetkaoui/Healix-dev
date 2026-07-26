"use client";

import { Download, FileUp, Plus, UsersRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { type TranslationFunction } from "@/lib/i18n";
import { type PatientAccountType } from "@/types/patient";

type PatientsHeaderProps = {
  accountType: PatientAccountType;
  onAddPatient: () => void;
  t: TranslationFunction;
};

export function PatientsHeader({
  accountType,
  onAddPatient,
  t,
}: PatientsHeaderProps) {
  const title =
    accountType === "DOCTOR"
      ? t("patients.page.doctorTitle")
      : t("patients.page.establishmentTitle");

  return (
    <section className="overflow-hidden rounded-[30px] border border-slate-200/80 bg-white shadow-[0_18px_54px_rgba(15,23,42,0.05)]">
      <div className="flex flex-col gap-6 p-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-cyan-100 bg-cyan-50 text-[#0b3b5f]">
            <UsersRound className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700">
              {t("patients.header.kicker")}
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 md:text-3xl">
              {title}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              {t("patients.page.subtitle")}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="outline" className="rounded-xl">
            <FileUp className="h-4 w-4" />
            {t("patients.header.import")}
          </Button>
          <Button variant="outline" className="rounded-xl">
            <Download className="h-4 w-4" />
            {t("patients.header.export")}
          </Button>
          <Button className="rounded-xl" onClick={onAddPatient}>
            <Plus className="h-4 w-4" />
            {t("patients.header.add")}
          </Button>
        </div>
      </div>
    </section>
  );
}
