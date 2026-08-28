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
        "rounded-[1.15rem] border p-5 shadow-[0_16px_38px_-30px_rgba(22,33,29,0.46)]",
        bannerKey === "active" || bannerKey === "verified"
          ? "border-[var(--accent-line)] bg-[var(--accent-soft)]/65"
          : bannerKey === "suspended" || bannerKey === "rejected"
            ? "border-[#e4c5bc] bg-[#fbefeb]"
            : "border-[var(--gold-line)] bg-[var(--gold-soft)]/70",
      )}
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[0.82rem] rounded-bl-[0.26rem] border border-[var(--line)] bg-[var(--panel)] text-[var(--accent-dark)]">
            <Icon className="h-5 w-5" strokeWidth={1.7} aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-base font-medium text-[var(--ink)]">
              {t(`subscription.access.${bannerKey}.title`)}
            </h2>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-[var(--ink-soft)]">
              {t(`subscription.access.${bannerKey}.description`)}
            </p>
          </div>
        </div>
        {canGoToVerification ? (
          <Link
            href={verificationHref}
            className="inline-flex h-11 items-center justify-center rounded-[0.72rem] bg-[var(--accent-dark)] px-5 text-sm font-medium text-[var(--bg)] shadow-[0_10px_22px_-12px_rgba(18,61,50,0.72)] transition hover:bg-[var(--accent-deep)]"
          >
            {t(`subscription.access.${bannerKey}.action`)}
          </Link>
        ) : null}
      </div>
    </section>
  );
}
