"use client";

import { type UseMutationResult } from "@tanstack/react-query";
import { X } from "lucide-react";
import { type FormEvent, useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { type TranslationFunction } from "@/lib/i18n";
import { normalizeEmail } from "@/lib/security";

import {
  type CreateTeamInvitationPayload,
  type TeamInvitation,
} from "../types/team.types";
import { submitInvite, type InviteFormValues } from "../utils/team-utils";

const inviteFieldClass =
  "h-[42px] rounded-[var(--radius-sm)] border-[var(--border)] bg-[var(--surface)] text-sm text-[var(--text-primary)] shadow-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]";

// The card the invitation is filled in: the e-mail the account will be, and
// the role the server will grant. The form stays open, itself resetting, and
// the caller closes it once an invitation went through.
export function InviteDrawer({
  canInviteAdmin,
  mutation,
  onClosed,
  onInvited,
  t,
}: {
  canInviteAdmin: boolean;
  mutation: UseMutationResult<
    TeamInvitation,
    Error,
    CreateTeamInvitationPayload
  >;
  onClosed: () => void;
  onInvited: (email: string) => void;
  t: TranslationFunction;
}) {
  const [values, setValues] = useState<InviteFormValues>({
    email: "",
    role: "DOCTOR",
  });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{
    message: string;
    tone: "error" | "success";
  } | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (mutation.isPending) return;
    setNotice(null);

    const outcome = await submitInvite(values, {
      send: mutation.mutateAsync,
      t,
    });
    if (outcome.status === "invalid") {
      setError(outcome.errors.email ?? null);
      return;
    }
    if (outcome.status === "failed") {
      setNotice({
        message: outcome.message ?? t("team.errors.unknown"),
        tone: "error",
      });
      return;
    }

    onInvited(normalizeEmail(values.email));
    setValues({ email: "", role: "DOCTOR" });
    onClosed();
  };

  const roleOptions = [
    { label: t("team.inviteForm.roles.DOCTOR"), value: "DOCTOR" },
    ...(canInviteAdmin
      ? [{ label: t("team.inviteForm.roles.ADMIN"), value: "ADMIN" }]
      : []),
  ];

  return (
    <form
      className="mb-4 rounded-[var(--radius-sm)] border border-[var(--line-soft)] bg-[var(--surface-muted)] p-4"
      onSubmit={(event) => void submit(event)}
      noValidate
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">
            {t("team.inviteForm.title")}
          </h3>
          <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
            {t("team.inviteForm.subtitle")}
          </p>
        </div>
        <button
          aria-label={t("team.inviteForm.cancel")}
          className="clinical-button p-2 text-xs"
          onClick={onClosed}
          type="button"
        >
          <X size={14} strokeWidth={1.8} aria-hidden="true" />
        </button>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <Label
            className="text-[.8rem] font-medium text-[var(--text-primary)]"
            htmlFor="team-invite-email"
          >
            {t("team.inviteForm.fields.email")}
          </Label>
          <Input
            aria-describedby={
              t("team.inviteForm.fields.emailHelp")
                ? "team-invite-email-help"
                : undefined
            }
            aria-invalid={error ? true : undefined}
            className={inviteFieldClass}
            dir="ltr"
            id="team-invite-email"
            onChange={(event) => {
              setValues((current) => ({
                ...current,
                email: event.target.value,
              }));
              setError(null);
            }}
            type="text"
            value={values.email}
          />
          {error ? (
            <p
              className="mt-1 text-xs text-[var(--danger-ink)]"
              id="team-invite-email-error"
              role="alert"
            >
              {error}
            </p>
          ) : null}
          <p
            className="mt-1 text-[0.7rem] text-[var(--text-secondary)]"
            id="team-invite-email-help"
          >
            {t("team.inviteForm.fields.emailHelp")}
          </p>
        </div>

        <div>
          <Label
            className="text-[.8rem] font-medium text-[var(--text-primary)]"
            htmlFor="team-invite-role"
          >
            {t("team.inviteForm.fields.role")}
          </Label>
          <Select
            className={inviteFieldClass}
            id="team-invite-role"
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                role: event.target.value as InviteFormValues["role"],
              }))
            }
            value={values.role}
          >
            {roleOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          {values.role === "ADMIN" ? (
            <p className="mt-1 text-[0.7rem] text-[var(--text-secondary)]">
              {t("team.inviteForm.roleDescriptions.ADMIN")}
            </p>
          ) : (
            <p className="mt-1 text-[0.7rem] text-[var(--text-secondary)]">
              {t("team.inviteForm.roleDescriptions.DOCTOR")}
            </p>
          )}
          {canInviteAdmin ? null : (
            <p className="mt-1 text-[0.7rem] text-[var(--warning-ink)]">
              {t("team.inviteForm.adminRoleRefused")}
            </p>
          )}
        </div>
      </div>

      {notice ? (
        <p
          className={`mt-3 rounded-[var(--radius-sm)] border px-3 py-2 text-xs ${notice.tone === "error" ? "border-[var(--danger-line)] bg-[var(--danger-soft)] text-[var(--danger-ink)]" : "border-[var(--success-line)] bg-[var(--success-soft)] text-[var(--success-ink)]"}`}
          role={notice.tone === "error" ? "alert" : "status"}
        >
          {notice.message}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button
          className="clinical-button text-xs"
          onClick={onClosed}
          type="button"
        >
          {t("team.inviteForm.cancel")}
        </button>
        <button
          className="clinical-button clinical-button-primary text-xs"
          disabled={mutation.isPending || values.email.trim() === ""}
          type="submit"
        >
          {mutation.isPending
            ? t("team.inviteForm.sending")
            : t("team.inviteForm.submit")}
        </button>
      </div>
    </form>
  );
}
