"use client";

import { CheckCircle2, Hospital, Stethoscope } from "lucide-react";

import { cn } from "@/lib/utils";
import { type AccountType } from "@/types/auth";

import { type RegisterI18nProps } from "./RegisterPage";

type AccountTypeSelectorProps = RegisterI18nProps & {
  selectedType: AccountType | null;
  onSelect: (type: AccountType) => void;
};

const accountTypes = [
  {
    type: "ESTABLISHMENT" as const,
    titleKey: "register.accountType.establishment.title",
    descriptionKey: "register.accountType.establishment.description",
    icon: Hospital,
  },
  {
    type: "INDEPENDENT_DOCTOR" as const,
    titleKey: "register.accountType.independentDoctor.title",
    descriptionKey: "register.accountType.independentDoctor.description",
    icon: Stethoscope,
  },
];

export function AccountTypeSelector({
  selectedType,
  onSelect,
  t,
}: AccountTypeSelectorProps) {
  return (
    <section aria-labelledby="account-type-title">
      <div className="mb-4">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-700">
          {t("register.accountType.eyebrow")}
        </p>
        <h2
          id="account-type-title"
          className="mt-2 text-2xl font-semibold tracking-tight text-slate-950"
        >
          {t("register.accountType.title")}
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          {t("register.accountType.description")}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {accountTypes.map(({ type, titleKey, descriptionKey, icon: Icon }) => {
          const isSelected = selectedType === type;

          return (
            <button
              key={type}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onSelect(type)}
              className={cn(
                "group flex min-h-40 flex-col items-start rounded-lg border bg-white p-4 text-start shadow-sm transition hover:-translate-y-0.5 hover:border-cyan-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2",
                isSelected
                  ? "border-cyan-400 bg-cyan-50/80 shadow-cyan-950/10"
                  : "border-slate-200",
              )}
            >
              <span className="flex w-full items-start justify-between gap-3">
                <span
                  className={cn(
                    "flex h-11 w-11 items-center justify-center rounded-lg border",
                    isSelected
                      ? "border-cyan-200 bg-white text-cyan-700"
                      : "border-slate-200 bg-slate-50 text-slate-600",
                  )}
                >
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                {isSelected ? (
                  <CheckCircle2
                    className="h-5 w-5 text-cyan-700"
                    aria-hidden="true"
                  />
                ) : null}
              </span>
              <span className="mt-4 text-base font-semibold text-slate-950">
                {t(titleKey)}
              </span>
              <span className="mt-2 text-sm leading-6 text-slate-600">
                {t(descriptionKey)}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
