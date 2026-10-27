"use client";

import { BadgeCheck, Building2, CreditCard, ShieldAlert, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { type FormEvent, useState } from "react";

import { type TranslationFunction } from "@/lib/i18n";
import { ALGERIAN_WILAYAS } from "@/types/auth";

import { useAccountProfile, useUpdateAccountProfile } from "../hooks/use-account";
import { type AccountKind, type AccountProfile, type AccountVerificationStatus, type ProfileField } from "../types/account.types";
import { classifyAccountError } from "../utils/account-errors";
import { organizationHref, subscriptionHref, verificationHref } from "../utils/account-utils";
import { buildProfilePatch, isFieldLocked, type ProfileFormErrors, type ProfileFormValues, profileFormValues, submitProfile } from "../utils/profile-form";
import { SelectField, TextField } from "./AccountFields";
import { AccountErrorState, AccountSkeleton, InlineMessage, SectionCard } from "./AccountStateViews";

type ProfileSectionProps = {
  accountType: AccountKind;
  t: TranslationFunction;
};

export function ProfileSection({ accountType, t }: ProfileSectionProps) {
  const query = useAccountProfile();

  if (query.isLoading) return <AccountSkeleton t={t} />;
  if (query.isError || !query.data) {
    return <AccountErrorState errorKey={classifyAccountError(query.error).key} onRetry={() => void query.refetch()} t={t} />;
  }

  return (
    <div className="space-y-5">
      <VerificationCard accountType={accountType} profile={query.data} t={t} />
      <ProfileForm accountType={accountType} profile={query.data} t={t} />
    </div>
  );
}

const STATUS_TONES: Record<AccountVerificationStatus, string> = {
  DRAFT: "border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text-secondary)]",
  NOT_STARTED: "border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text-secondary)]",
  PENDING_VERIFICATION: "border-[var(--warning-line)] bg-[var(--warning-soft)] text-[var(--warning-ink)]",
  REJECTED: "border-[var(--danger-line)] bg-[var(--danger-soft)] text-[var(--danger-ink)]",
  SUSPENDED: "border-[var(--danger-line)] bg-[var(--danger-soft)] text-[var(--danger-ink)]",
  VERIFIED: "border-[var(--success-line)] bg-[var(--success-soft)] text-[var(--success-ink)]",
};

// The verification of the account and its subscription, with the way to each.
export function VerificationCard({ accountType, profile, t }: { accountType: AccountKind; profile: AccountProfile; t: TranslationFunction }) {
  const status = profile.verificationStatus;
  const Icon = status === "VERIFIED" ? ShieldCheck : status === "PENDING_VERIFICATION" ? BadgeCheck : ShieldAlert;
  const help = status === "VERIFIED" ? "verifiedHelp" : status === "PENDING_VERIFICATION" ? "pendingHelp" : "otherHelp";

  return (
    <SectionCard title={t("account.profile.verification.label")}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.72rem] font-semibold ${STATUS_TONES[status]}`}>
            <Icon size={13} strokeWidth={2} aria-hidden="true" />
            {t(`account.profile.verificationStatuses.${status}`)}
          </span>
          <p className="mt-2 max-w-xl text-xs leading-5 text-[var(--text-secondary)]">{t(`account.profile.verification.${help}`)}</p>
        </div>
        <Link href={verificationHref(accountType)} className="clinical-button shrink-0">
          <BadgeCheck size={15} strokeWidth={1.8} aria-hidden="true" />
          {t("account.profile.verification.open")}
        </Link>
      </div>
      <div className="mt-4 flex flex-col gap-2 border-t border-[var(--line-soft)] pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-[var(--text-secondary)]">
          <span className="font-semibold text-[var(--text-primary)]">{t("account.profile.subscription.label")} : </span>
          {t(`account.profile.subscriptionStatuses.${profile.subscriptionStatus}`)}
        </p>
        <Link href={subscriptionHref(accountType)} className="clinical-link text-xs">
          <CreditCard size={13} className="me-1 inline" aria-hidden="true" />
          {t("account.profile.subscription.open")}
        </Link>
      </div>
    </SectionCard>
  );
}

export function ProfileForm({ accountType, profile, t }: { accountType: AccountKind; profile: AccountProfile; t: TranslationFunction }) {
  const update = useUpdateAccountProfile();
  const [values, setValues] = useState<ProfileFormValues>(() => profileFormValues(profile));
  const [errors, setErrors] = useState<ProfileFormErrors>({});
  const [notice, setNotice] = useState<{ message: string; tone: "error" | "success" } | null>(null);
  const isDirty = Object.keys(buildProfilePatch(values, profile)).length > 0;
  const isEstablishment = accountType === "ESTABLISHMENT";

  const change = (field: ProfileField) => (value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setNotice(null);
  };
  const locked = (field: ProfileField) => isFieldLocked(profile, field);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (update.isPending) return;
    setNotice(null);

    const outcome = await submitProfile(values, profile, { send: update.mutateAsync, t });
    if (outcome.status === "success") {
      setValues(profileFormValues(outcome.profile));
      setErrors({});
      setNotice({ message: t("account.profile.notices.saved"), tone: "success" });
    } else if (outcome.status === "unchanged") {
      setNotice({ message: t("account.profile.notices.nothingToSave"), tone: "success" });
    } else {
      setErrors(outcome.errors);
      if (outcome.status === "failed" && outcome.message) setNotice({ message: outcome.message, tone: "error" });
    }
  };

  const wilayaOptions = ALGERIAN_WILAYAS.map((wilaya) => ({ label: wilaya, value: wilaya }));

  return (
    <form onSubmit={(event) => void onSubmit(event)} noValidate aria-busy={update.isPending} className="space-y-5">
      {isEstablishment ? <OrganizationNotice t={t} /> : null}
      <SectionCard title={t("account.profile.sections.identity")} description={t("account.profile.subtitle")}>
        <div className="grid gap-4 md:grid-cols-2">
          {/* The name of the connected person only: the establishment identity
              is not the account's and lives in the organization module. */}
          <TextField id="account-fullName" label={t("account.profile.fields.fullName")} value={values.fullName} onChange={change("fullName")} locked={locked("fullName")} error={errors.fullName} autoComplete="name" t={t} />
          {!isEstablishment ? (
            <>
              <TextField id="account-speciality" label={t("account.profile.fields.speciality")} value={values.speciality} onChange={change("speciality")} locked={locked("speciality")} error={errors.speciality} t={t} />
              <SelectField id="account-wilaya" label={t("account.profile.fields.wilaya")} value={values.wilaya} onChange={change("wilaya")} options={wilayaOptions} placeholder={t("account.profile.selectPlaceholder")} locked={locked("wilaya")} error={errors.wilaya} t={t} />
            </>
          ) : null}
          {profile.doctor ? (
            <div>
              <p className="text-[.8rem] font-medium text-[var(--text-primary)]">{t("account.profile.fields.affiliation")}</p>
              <p className="mt-2.5 text-sm text-[var(--text-secondary)]">
                {profile.doctor.isIndependent || !profile.doctor.establishmentName ? t("account.profile.affiliation.independent") : t("account.profile.affiliation.attached", { name: profile.doctor.establishmentName })}
              </p>
            </div>
          ) : null}
        </div>
      </SectionCard>

      <SectionCard title={t("account.profile.sections.contact")}>
        <div className="grid gap-4 md:grid-cols-2">
          <TextField id="account-email" label={t("account.profile.fields.email")} value={profile.email} onChange={() => undefined} readOnlyValue help={t("account.profile.emailHelp")} dir="ltr" t={t} />
          <TextField
            id="account-phone"
            label={t("account.profile.fields.phone")}
            value={values.phone}
            onChange={change("phone")}
            error={errors.phone}
            help={`${profile.isPhoneVerified ? t("account.profile.phoneVerified") : t("account.profile.phoneNotVerified")}. ${t("account.profile.phoneHelp")}`}
            autoComplete="tel"
            inputMode="tel"
            dir="ltr"
            t={t}
          />
          {profile.doctor ? (
            <TextField className="md:col-span-2" id="account-address" label={t("account.profile.fields.doctorAddress")} value={values.address} onChange={change("address")} error={errors.address} autoComplete="street-address" t={t} />
          ) : null}
        </div>
      </SectionCard>

      {notice ? <InlineMessage message={notice.message} tone={notice.tone} /> : null}
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" className="clinical-button" disabled={!isDirty || update.isPending} onClick={() => { setValues(profileFormValues(profile)); setErrors({}); setNotice(null); }}>
          {t("account.profile.actions.reset")}
        </button>
        <button type="submit" className="clinical-button clinical-button-primary" disabled={!isDirty || update.isPending}>
          {update.isPending ? t("account.profile.actions.saving") : t("account.profile.actions.save")}
        </button>
      </div>
    </form>
  );
}

// The establishment data are not account data: the settings page says where
// they live instead of duplicating the organization form.
function OrganizationNotice({ t }: { t: TranslationFunction }) {
  return (
    <section className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--line-soft)] bg-[var(--surface-muted)] p-4 sm:flex-row sm:items-center sm:justify-between" role="note">
      <div className="flex min-w-0 items-start gap-3">
        <Building2 className="mt-0.5 shrink-0 text-[var(--text-secondary)]" size={17} strokeWidth={1.7} aria-hidden="true" />
        <p className="text-xs leading-5 text-[var(--text-secondary)]">{t("account.profile.organizationNote.message")}</p>
      </div>
      <Link href={organizationHref} className="clinical-link shrink-0 text-xs">
        <CreditCard size={13} className="me-1 inline" aria-hidden="true" />
        {t("account.profile.organizationNote.open")}
      </Link>
    </section>
  );
}
