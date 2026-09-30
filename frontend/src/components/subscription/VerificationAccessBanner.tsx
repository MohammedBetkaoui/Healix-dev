import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  ShieldAlert,
} from "lucide-react";

import { type TranslationFunction } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { type SubscriptionContext } from "@/types/subscription";

type VerificationAccessBannerProps = {
  context: SubscriptionContext;
  t: TranslationFunction;
  verificationHref: string;
};

type BannerKey =
  | "active"
  | "pending"
  | "rejected"
  | "suspended"
  | "unverified"
  | "verified";

function getBannerKey(context: SubscriptionContext): BannerKey {
  if (
    context.accountStatus === "SUSPENDED" ||
    context.verificationStatus === "SUSPENDED"
  ) {
    return "suspended";
  }

  if (
    context.accountStatus === "REJECTED" ||
    context.verificationStatus === "REJECTED"
  ) {
    return "rejected";
  }

  if (
    context.accountStatus === "PENDING_VERIFICATION" ||
    context.verificationStatus === "PENDING_VERIFICATION"
  ) {
    return "pending";
  }

  if (
    context.accountStatus === "ACTIVE" &&
    context.subscriptionStatus === "ACTIVE" &&
    context.verificationStatus === "VERIFIED"
  ) {
    return "active";
  }

  if (context.verificationStatus === "VERIFIED") {
    return "verified";
  }

  return "unverified";
}

// An official notice: neutral surface, a coloured inline-start rule and icon
// carry the severity instead of a fully tinted block.
const bannerTone: Record<BannerKey, { icon: string; rule: string }> = {
  active: {
    icon: "bg-[var(--success-soft)] text-[var(--success-ink)]",
    rule: "border-s-[color:var(--success)]",
  },
  pending: {
    icon: "bg-[var(--warning-soft)] text-[var(--warning-ink)]",
    rule: "border-s-[color:var(--warning)]",
  },
  rejected: {
    icon: "bg-[var(--danger-soft)] text-[var(--danger-ink)]",
    rule: "border-s-[color:var(--danger)]",
  },
  suspended: {
    icon: "bg-[var(--danger-soft)] text-[var(--danger-ink)]",
    rule: "border-s-[color:var(--danger)]",
  },
  unverified: {
    icon: "bg-[var(--warning-soft)] text-[var(--warning-ink)]",
    rule: "border-s-[color:var(--warning)]",
  },
  verified: {
    icon: "bg-[var(--success-soft)] text-[var(--success-ink)]",
    rule: "border-s-[color:var(--success)]",
  },
};

export function VerificationAccessBanner({
  context,
  t,
  verificationHref,
}: VerificationAccessBannerProps) {
  const bannerKey = getBannerKey(context);

  // An active subscription is already stated by SubscriptionStatusCard and the
  // summary strip: the notice is only for situations that need attention.
  if (bannerKey === "active") {
    return null;
  }

  const Icon =
    bannerKey === "verified"
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
      role={
        bannerKey === "suspended" || bannerKey === "rejected"
          ? "alert"
          : undefined
      }
      className={cn(
        "flex flex-col gap-4 rounded-[var(--radius-md)] border border-s-[3px] border-[var(--border)] bg-[var(--surface)] px-5 py-4 md:flex-row md:items-center md:justify-between",
        bannerTone[bannerKey].rule,
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)]",
            bannerTone[bannerKey].icon,
          )}
        >
          <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">
            {t(`subscription.access.${bannerKey}.title`)}
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--text-secondary)]">
            {t(`subscription.access.${bannerKey}.description`)}
          </p>
        </div>
      </div>
      {canGoToVerification ? (
        <Link
          href={verificationHref}
          className="clinical-button clinical-button-primary shrink-0 px-4"
        >
          {t(`subscription.access.${bannerKey}.action`)}
          <ArrowRight
            size={16}
            strokeWidth={1.8}
            aria-hidden="true"
            className="rtl:rotate-180"
          />
        </Link>
      ) : null}
    </section>
  );
}
