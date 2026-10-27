"use client";

import { type FormEvent, useState } from "react";

import { type TranslationFunction } from "@/lib/i18n";

import { useUpdateOrganization } from "../hooks/use-organization";
import { type OrganizationResponse } from "../types/organization.types";
import {
  APPOINTMENT_DURATIONS,
  buildContactsPatch,
  contactsFormValues,
  type ContactsFormErrors,
  type ContactsFormValues,
  submitContacts,
} from "../utils/organization-form";
import { SelectField, TextField } from "./OrganizationFields";
import { InlineMessage, SectionCard } from "./OrganizationStateViews";

export function ContactsSection({
  organization,
  t,
}: {
  organization: OrganizationResponse;
  t: TranslationFunction;
}) {
  const update = useUpdateOrganization();
  const [values, setValues] = useState<ContactsFormValues>(() =>
    contactsFormValues(organization),
  );
  const [errors, setErrors] = useState<ContactsFormErrors>({});
  const [notice, setNotice] = useState<{
    message: string;
    tone: "error" | "success";
  } | null>(null);
  const isDirty =
    Object.keys(buildContactsPatch(values, organization)).length > 0;

  const change = (field: keyof ContactsFormValues) => (value: string) => {
    const next = field === "defaultAppointmentDuration" ? Number(value) : value;
    setValues((current) => ({ ...current, [field]: next }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setNotice(null);
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (update.isPending) return;
    setNotice(null);

    const outcome = await submitContacts(values, organization, {
      send: update.mutateAsync,
      t,
    });
    if (outcome.status === "success") {
      setValues(contactsFormValues(outcome.organization));
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

  const durationOptions = APPOINTMENT_DURATIONS.map((option) => ({
    label: t("organization.contacts.durationSuffix", { minutes: option }),
    value: String(option),
  }));

  return (
    <form
      onSubmit={(event) => void onSubmit(event)}
      noValidate
      aria-busy={update.isPending}
      className="space-y-5"
    >
      <SectionCard
        title={t("organization.contacts.title")}
        description={t("organization.contacts.subtitle")}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <TextField
            id="organization-phone"
            label={t("organization.contacts.fields.phone")}
            value={values.phone}
            onChange={change("phone")}
            error={errors.phone}
            inputMode="tel"
            dir="ltr"
          />
          <TextField
            id="organization-professionalEmail"
            label={t("organization.contacts.fields.professionalEmail")}
            value={values.professionalEmail}
            onChange={change("professionalEmail")}
            error={errors.professionalEmail}
            type="email"
            dir="ltr"
          />
          <TextField
            id="organization-website"
            label={t("organization.contacts.fields.website")}
            value={values.website}
            onChange={change("website")}
            error={errors.website}
            dir="ltr"
            help={t("organization.contacts.websiteHelp")}
          />
          <SelectField
            id="organization-defaultAppointmentDuration"
            label={t("organization.contacts.fields.defaultAppointmentDuration")}
            value={String(values.defaultAppointmentDuration)}
            onChange={change("defaultAppointmentDuration")}
            options={durationOptions}
            error={errors.defaultAppointmentDuration}
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
            setValues(contactsFormValues(organization));
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
