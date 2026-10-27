"use client";

import { BadgeCheck, ShieldAlert, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { type TranslationFunction } from "@/lib/i18n";
import { ESTABLISHMENT_TYPE_OPTIONS } from "@/types/auth";

import {
  type OrganizationResponse,
  type OrganizationVerificationStatus,
} from "../types/organization.types";
import { LockedNote } from "./OrganizationFields";
import { SectionCard } from "./OrganizationStateViews";

const STATUS_TONES: Record<OrganizationVerificationStatus, string> = {
  DRAFT:
    "border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text-secondary)]",
  NOT_STARTED:
    "border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text-secondary)]",
  PENDING_VERIFICATION:
    "border-[var(--warning-line)] bg-[var(--warning-soft)] text-[var(--warning-ink)]",
  REJECTED:
    "border-[var(--danger-line)] bg-[var(--danger-soft)] text-[var(--danger-ink)]",
  SUSPENDED:
    "border-[var(--danger-line)] bg-[var(--danger-soft)] text-[var(--danger-ink)]",
  VERIFIED:
    "border-[var(--success-line)] bg-[var(--success-soft)] text-[var(--success-ink)]",
};

type IdentityRow = { label: string; value: string };

function identityRows(
  organization: OrganizationResponse,
  t: TranslationFunction,
): IdentityRow[] {
  const { identity } = organization;
  const typeOption = ESTABLISHMENT_TYPE_OPTIONS.find(
    (option) => option.value === identity.type,
  );

  return [
    { label: t("organization.identity.fields.name"), value: identity.name },
    {
      label: t("organization.identity.fields.type"),
      value: typeOption
        ? t(`register.establishmentTypes.${typeOption.translationKey}`)
        : identity.type,
    },
    {
      label: t("organization.identity.fields.wilaya"),
      value: identity.commune
        ? `${identity.wilaya}, ${identity.commune}`
        : identity.wilaya,
    },
    {
      label: t("organization.identity.fields.address"),
      value: identity.address,
    },
  ];
}

// The establishment summary: read-only, wherever it comes from. The identity
// never changes through this page, verified or not.
export function IdentitySection({
  organization,
  t,
}: {
  organization: OrganizationResponse;
  t: TranslationFunction;
}) {
  const status = organization.identity.verificationStatus;
  const Icon =
    status === "VERIFIED"
      ? ShieldCheck
      : status === "PENDING_VERIFICATION"
        ? BadgeCheck
        : ShieldAlert;
  const verified = organization.identity.source === "VERIFICATION_DATA";

  return (
    <SectionCard
      title={t("organization.identity.title")}
      description={t("organization.identity.subtitle")}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.72rem] font-semibold ${STATUS_TONES[status]}`}
        >
          <Icon size={13} strokeWidth={2} aria-hidden="true" />
          {t(`account.profile.verificationStatuses.${status}`)}
        </span>
        <Link
          href="/establishment/verification"
          className="clinical-button shrink-0 text-xs"
        >
          {t("organization.identity.openVerification")}
        </Link>
      </div>
      <div className="mt-4">
        <LockedNote>
          {verified
            ? t("organization.identity.verifiedNote")
            : t("organization.identity.registrationNote")}
        </LockedNote>
      </div>
      <dl className="mt-4 grid gap-4 border-t border-[var(--line-soft)] pt-4 md:grid-cols-2">
        {identityRows(organization, t).map((row) => (
          <div key={row.label}>
            <dt className="text-[.8rem] font-medium text-[var(--text-primary)]">
              {row.label}
            </dt>
            <dd
              className="mt-1 text-sm text-[var(--text-secondary)]"
              dir="auto"
            >
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 flex flex-col gap-2 border-t border-[var(--line-soft)] pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-[var(--text-secondary)]">
          <span className="font-semibold text-[var(--text-primary)]">
            {t("organization.identity.subscriptionLabel")} :{" "}
          </span>
          {t(
            `account.profile.subscriptionStatuses.${organization.identity.subscriptionStatus}`,
          )}
        </p>
        <Link
          href="/establishment/subscription"
          className="clinical-link text-xs"
        >
          {t("organization.identity.openSubscription")}
        </Link>
      </div>
    </SectionCard>
  );
}
