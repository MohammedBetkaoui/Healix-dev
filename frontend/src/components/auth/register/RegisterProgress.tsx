import { CheckCircle2 } from "lucide-react";

import { cn } from "@/lib/utils";

import { type RegisterI18nProps } from "./RegisterPage";

const steps = [
  "account",
  "verification",
  "subscription",
  "activation",
] as const;

export function RegisterProgress({ t }: RegisterI18nProps) {
  return (
    <nav aria-label={t("register.progress.ariaLabel")} className="w-full">
      <ol className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {steps.map((step, index) => {
          const isActive = index === 0;

          return (
            <li
              key={step}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm",
                isActive
                  ? "border-cyan-200 bg-cyan-50 text-[#0b3b5f]"
                  : "border-slate-200 bg-white/70 text-slate-500",
              )}
              aria-current={isActive ? "step" : undefined}
            >
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                  isActive
                    ? "bg-[#0b3b5f] text-white"
                    : "bg-slate-100 text-slate-500",
                )}
              >
                {isActive ? (
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  index + 1
                )}
              </span>
              <span className="truncate font-medium">
                {t(`register.progress.steps.${step}`)}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
