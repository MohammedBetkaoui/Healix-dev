import Link from "next/link";
import { AlertTriangle, CheckCircle2, Clock3, ShieldAlert } from "lucide-react";

import { type TranslationFunction } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { type SubscriptionContext } from "@/types/subscription";

type VerificationAccessBannerProps = {
  context: SubscriptionContext;
  t: TranslationFunction;
  verificationHref: string;
};

function getBannerKey(context: SubscriptionContext) {
  if (context.accountStatus === "SUSPENDED") {
    return "suspended";
  }

  if (context.verificationStatus === "REJECTED") {
    return "rejected";
  }

  if (context.verificationStatus === "PENDING_VERIFICATION") {
    return "pending";
  }

  if (
    context.accountStatus === "ACTIVE" &&
    context.subscriptionStatus === "ACTIVE"
  ) {
    return "active";
  }

  if (
    context.accountStatus === "VERIFIED_NO_PLAN" &&
    context.verificationStatus === "VERIFIED"
  ) {
    return "verified";
  }

  return "unverified";
}

export function VerificationAccessBanner({
  context,
  t,
  verificationHref,
}: VerificationAccessBannerProps) {
  const bannerKey = getBannerKey(context);
  const Icon =
    bannerKey === "active" || bannerKey === "verified"
      ? CheckCircle2
      : bannerKey === "pending"
        ? Clock3
        : bannerKey === "suspended"
          ? ShieldAlert
          : AlertTriangle;
  const canGoToVerification = ["unverified", "pending", "rejected"].includes(
    bannerKey,
  );

  return (
    <section
      className={cn(
        "rounded-[24px] border p-5 shadow-[0_12px_36px_rgba(15,23,42,0.04)]",
        bannerKey === "active" || bannerKey === "verified"
          ? "border-emerald-100 bg-emerald-50/60"
          : bannerKey === "suspended" || bannerKey === "rejected"
            ? "border-red-100 bg-red-50/60"
            : "border-amber-100 bg-amber-50/60",
      )}
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-[#0b3b5f] shadow-sm">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-slate-950">
              {t(`subscription.access.${bannerKey}.title`)}
            </h2>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">
              {t(`subscription.access.${bannerKey}.description`)}
            </p>
          </div>
        </div>
        {canGoToVerification ? (
          <Link
            href={verificationHref}
            className="inline-flex h-11 items-center justify-center rounded-full bg-[#0b3b5f] px-5 text-sm font-semibold text-white shadow-sm shadow-sky-950/15 transition hover:bg-[#092f4d]"
          >
            {t(`subscription.access.${bannerKey}.action`)}
          </Link>
        ) : null}
      </div>
    </section>
  );
}
