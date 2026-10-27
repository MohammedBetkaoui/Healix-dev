"use client";

import { type FormEvent, useState } from "react";

import { type TranslationFunction } from "@/lib/i18n";

import { useUpdateOrganization } from "../hooks/use-organization";
import { type OrganizationResponse } from "../types/organization.types";
import {
  buildDataProtectionPatch,
  type DataProtectionFormErrors,
  type DataProtectionFormValues,
  dataProtectionFormValues,
  submitDataProtection,
} from "../utils/organization-form";
import { TextField } from "./OrganizationFields";
import { InlineMessage, SectionCard } from "./OrganizationStateViews";

export function DataProtectionSection({
  organization,
  t,
}: {
  organization: OrganizationResponse;
  t: TranslationFunction;
}) {
  const update = useUpdateOrganization();
  const [values, setValues] = useState<DataProtectionFormValues>(() =>
    dataProtectionFormValues(organization),
  );
  const [errors, setErrors] = useState<DataProtectionFormErrors>({});
  const [notice, setNotice] = useState<{
    message: string;
    tone: "error" | "success";
  } | null>(null);
  const isDirty =
    Object.keys(buildDataProtectionPatch(values, organization)).length > 0;

  const change = (field: keyof DataProtectionFormValues) => (value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setNotice(null);
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (update.isPending) return;
    setNotice(null);

    const outcome = await submitDataProtection(values, organization, {
      send: update.mutateAsync,
      t,
    });
    if (outcome.status === "success") {
      setValues(dataProtectionFormValues(outcome.organization));
      setErrors({});
      setNotice({ message: t("organization.notices.saved"), tone: "success" });
    } else if (outcome.status === "unchanged") {
      setNotice({
        message: t("organization.notices.nothingToSave"),
        tone: "success",
      });
    } else {
      setErrors(outcome.errors);
      if (outcome.status === "failed" && outcome.message)
        setNotice({ message: outcome.message, tone: "error" });
    }
  };

  return (
    <form
      onSubmit={(event) => void onSubmit(event)}
      noValidate
      aria-busy={update.isPending}
      className="space-y-5"
    >
      <SectionCard
        title={t("organization.protection.title")}
        description={t("organization.protection.subtitle")}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <TextField
            id="organization-dpo-name"
            label={t("organization.protection.fields.name")}
            value={values.name}
            onChange={change("name")}
            error={errors.name}
          />
          <TextField
            id="organization-dpo-email"
            label={t("organization.protection.fields.email")}
            value={values.email}
            onChange={change("email")}
            error={errors.email}
            dir="ltr"
          />
          <TextField
            id="organization-dpo-phone"
            label={t("organization.protection.fields.phone")}
            value={values.phone}
            onChange={change("phone")}
            error={errors.phone}
            inputMode="tel"
            dir="ltr"
            help={t("organization.protection.help")}
            className="md:row-start-2"
          />
        </div>
      </SectionCard>

      {notice ? (
        <InlineMessage message={notice.message} tone={notice.tone} />
      ) : null}
      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          className="clinical-button"
          disabled={!isDirty || update.isPending}
          onClick={() => {
            setValues(dataProtectionFormValues(organization));
            setErrors({});
            setNotice(null);
          }}
        >
          {t("organization.actions.reset")}
        </button>
        <button
          type="submit"
          className="clinical-button clinical-button-primary"
          disabled={!isDirty || update.isPending}
        >
          {update.isPending
            ? t("organization.actions.saving")
            : t("organization.actions.save")}
        </button>
      </div>
    </form>
  );
}
