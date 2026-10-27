"use client";

import Link from "next/link";

import { type Locale } from "@/i18n";
import { type TranslationFunction } from "@/lib/i18n";

import {
  type OrganizationLegal,
  type OrganizationResponse,
} from "../types/organization.types";
import { LockedNote } from "./OrganizationFields";
import { SectionCard } from "./OrganizationStateViews";

type LegalRow = { label: string; value: string };

// The representative counts twice: the person, then the function they hold.
function legalRows(
  legal: OrganizationLegal,
  t: TranslationFunction,
  locale: Locale,
): LegalRow[] {
  const values: Array<[string, string | null]> = [
    ["legalForm", legal.legalForm],
    ["representative", legal.representative?.fullName ?? null],
    ["representativeFunction", legal.representative?.function ?? null],
    ["commercialRegisterNumber", legal.commercialRegisterNumber],
    ["commercialRegisterWilaya", legal.commercialRegisterWilaya],
    [
      "commercialRegisterIssuedAt",
      formattedDate(legal.commercialRegisterIssuedAt, locale),
    ],
    ["nif", legal.nif],
    ["nis", legal.nis],
    ["taxCenter", legal.taxCenter],
    ["healthAuthorizationNumber", legal.healthAuthorizationNumber],
    [
      "healthAuthorizationIssuedAt",
      formattedDate(legal.healthAuthorizationIssuedAt, locale),
    ],
    ["healthAuthorizationAuthority", legal.healthAuthorizationAuthority],
    ["healthDirectionWilaya", legal.healthDirectionWilaya],
    ["authorizedActivityType", legal.authorizedActivityType],
  ];

  return values
    .filter(([, value]) => Boolean(value))
    .map(([key, value]) => ({
      label: t(`organization.legal.fields.${key}`),
      value: value!,
    }));
}

function formattedDate(iso: string | null, locale: Locale): string | null {
  if (!iso) return null;
  // The mapper answered an ISO day: the interface alone decides how to show it.
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-DZ" : "fr-FR", {
    dateStyle: "short",
  }).format(new Date(iso));
}

// The legal paperwork of the dossier, where 'nullable' means "not recorded
// yet". Nothing here is editable through this page, in any state.
export function LegalSection({
  locale,
  organization,
  t,
}: {
  locale: Locale;
  organization: OrganizationResponse;
  t: TranslationFunction;
}) {
  const legal = organization.legal;

  return (
    <SectionCard
      title={t("organization.legal.title")}
      description={t("organization.legal.subtitle")}
    >
      {legal ? (
        <>
          <LockedNote>
            {legal.locked
              ? t("organization.legal.lockedHelp")
              : t("organization.legal.pendingHelp")}
          </LockedNote>
          {legalRows(legal, t, locale).length > 0 ? (
            <dl className="mt-4 grid gap-4 border-t border-[var(--line-soft)] pt-4 md:grid-cols-2">
              {legalRows(legal, t, locale).map((row) => (
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
          ) : null}
        </>
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs leading-5 text-[var(--text-secondary)]">
            {t("organization.legal.empty")}
          </p>
          <Link
            href="/establishment/verification"
            className="clinical-button shrink-0 text-xs"
          >
            {t("organization.identity.openVerification")}
          </Link>
        </div>
      )}
    </SectionCard>
  );
}
