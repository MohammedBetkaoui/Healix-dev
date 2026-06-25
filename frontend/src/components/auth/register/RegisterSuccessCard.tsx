"use client";

import { ArrowRight, CheckCircle2, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";
import { type AccountType } from "@/types/auth";

import { type RegisterI18nProps } from "./RegisterPage";

type RegisterSuccessCardProps = RegisterI18nProps & {
  accountType?: AccountType;
};

export function RegisterSuccessCard({
  accountType = "ESTABLISHMENT",
  direction,
  t,
}: RegisterSuccessCardProps) {
  const isDoctorAccount = accountType === "INDEPENDENT_DOCTOR";
  const titleKey = isDoctorAccount
    ? "register.feedback.successCard.doctorTitle"
    : "register.feedback.successCard.title";
  const descriptionKey = isDoctorAccount
    ? "register.feedback.successCard.doctorDescription"
    : "register.feedback.successCard.description";

  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-lg border border-emerald-200 bg-emerald-50/85 p-5 text-emerald-950 shadow-lg shadow-emerald-950/5"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
          <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-lg font-semibold">{t(titleKey)}</h2>
          <p className="mt-2 text-sm leading-7 text-emerald-900">
            {t(descriptionKey)}
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <Link
          href="/demo"
          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#0b3b5f] px-4 text-sm font-semibold text-white shadow-sm shadow-sky-950/15 transition-colors hover:bg-[#092f4d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2"
        >
          <ArrowRight
            className={cn("h-4 w-4", direction === "rtl" && "rotate-180")}
            aria-hidden="true"
          />
          {t("register.feedback.successCard.demoAction")}
        </Link>
        <Link
          href="/verification"
          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-white px-4 text-sm font-semibold text-emerald-900 shadow-sm transition-colors hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
        >
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          {t("register.feedback.successCard.verificationAction")}
        </Link>
      </div>
    </div>
  );
}
