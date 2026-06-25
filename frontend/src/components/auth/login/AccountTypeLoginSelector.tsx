"use client";

import { Building2, CheckCircle2, Stethoscope } from "lucide-react";

import { cn } from "@/lib/utils";
import { type LoginAccountType } from "@/types/auth";

type AccountTypeLoginSelectorProps = {
  direction: "ltr" | "rtl";
  error?: string;
  selectedType: LoginAccountType | "";
  onSelect: (type: LoginAccountType) => void;
  t: (key: string) => string;
};

const options = [
  {
    type: "ESTABLISHMENT" as const,
    icon: Building2,
    labelKey: "login.accountType.establishment",
  },
  {
    type: "INDEPENDENT_DOCTOR" as const,
    icon: Stethoscope,
    labelKey: "login.accountType.doctor",
  },
];

export function AccountTypeLoginSelector({
  direction,
  error,
  onSelect,
  selectedType,
  t,
}: AccountTypeLoginSelectorProps) {
  return (
    <div>
      <p className="text-sm font-medium text-slate-700">
        {t("login.form.accountTypeLabel")}
      </p>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        {options.map(({ type, icon: Icon, labelKey }) => {
          const isSelected = selectedType === type;

          return (
            <button
              key={type}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onSelect(type)}
              className={cn(
                "flex min-h-24 items-start gap-3 rounded-xl border p-4 text-start transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2",
                isSelected
                  ? "border-cyan-300 bg-cyan-50/90 shadow-sm shadow-cyan-950/5"
                  : "border-slate-200 bg-white/90 hover:border-cyan-200 hover:bg-cyan-50/50",
              )}
            >
              <span
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border",
                  isSelected
                    ? "border-cyan-200 bg-white text-cyan-700"
                    : "border-slate-200 bg-slate-50 text-slate-600",
                )}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="flex min-w-0 flex-1 items-start justify-between gap-3">
                <span className="pt-1 text-sm font-semibold text-slate-900">
                  {t(labelKey)}
                </span>
                {isSelected ? (
                  <CheckCircle2
                    className={cn(
                      "mt-1 h-5 w-5 shrink-0 text-cyan-700",
                      direction === "rtl" && "order-first",
                    )}
                    aria-hidden="true"
                  />
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
      {error ? (
        <p className="mt-2 text-sm font-medium text-red-600">{error}</p>
      ) : null}
    </div>
  );
}
