"use client";

import { AlertTriangle, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { AuthPageShell } from "@/components/auth/login/AuthPageShell";
import { PasswordInput } from "@/components/auth/register/PasswordInput";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { type Locale } from "@/i18n";
import { type Direction, type TranslationFunction } from "@/lib/i18n";
import { ALGERIAN_WILAYAS } from "@/types/auth";

import {
  useAcceptTeamInvitation,
  useInvitationInspection,
} from "../hooks/use-team";
import {
  buildAcceptPayload,
  formatTeamDate,
  validateAcceptForm,
  type AcceptFormErrors,
  type AcceptFormValues,
} from "../utils/team-utils";
import {
  classifyTeamError,
  invitationStateOf,
  type InvitationState,
} from "../utils/team-errors";

type Stage =
  "checking" | "expired" | "form" | "invalid" | "revoked" | "success" | "used";

const loginHref = "/login";

const acceptFieldClass =
  "h-[42px] rounded-[var(--radius-sm)] border-[var(--border)] bg-[var(--surface)] text-sm text-[var(--text-primary)] shadow-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]";

export function InviteAcceptPage() {
  return (
    <AuthPageShell>
      {({ direction, locale, t }) => (
        // useSearchParams needs a Suspense boundary: only the panel waits for
        // the address, the page around it renders right away.
        <Suspense fallback={null}>
          <InviteAcceptPanel direction={direction} locale={locale} t={t} />
        </Suspense>
      )}
    </AuthPageShell>
  );
}

// The token of the address, read once: whatever comes before or after it in
// the query keeps no bearing.
function readInvitationToken(search: string): string {
  const value = new URLSearchParams(search).get("token");
  return typeof value === "string" && value.trim() !== "" ? value.trim() : "";
}

type InviteAcceptPanelProps = {
  direction: Direction;
  locale: Locale;
  t: TranslationFunction;
};

function InviteAcceptPanel({ direction, locale, t }: InviteAcceptPanelProps) {
  const searchParams = useSearchParams();
  // Read once, then kept in memory only: the address is cleaned right after.
  const [token] = useState(() =>
    readInvitationToken(searchParams?.toString() ?? ""),
  );
  const inspection = useInvitationInspection(token);
  const acceptance = useAcceptTeamInvitation();
  // An invitation state met while accepting (the token expired or was
  // revoked in between, most often) freezes the screen that names it.
  const [frozenState, setFrozenState] = useState<InvitationState | null>(null);
  const [values, setValues] = useState<AcceptFormValues>({
    confirmPassword: "",
    fullName: "",
    password: "",
    phone: "",
    professionalAddress: "",
    speciality: "",
    wilaya: "",
  });
  const [errors, setErrors] = useState<AcceptFormErrors>({});
  const [failure, setFailure] = useState<string | null>(null);

  // The token leaves the address bar and the history as soon as it is read.
  useEffect(() => {
    const { hash, pathname, search } = window.location;

    if (new URLSearchParams(search).has("token")) {
      const params = new URLSearchParams(search);
      params.delete("token");
      const nextSearch = params.toString();
      window.history.replaceState(
        null,
        "",
        `${pathname}${nextSearch ? `?${nextSearch}` : ""}${hash}`,
      );
    }
  }, []);

  const role = inspection.data?.role ?? "DOCTOR";
  const change = (field: keyof AcceptFormValues) => (value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const stage: Stage = frozenState
    ? frozenState
    : !token
      ? "invalid"
      : inspection.isLoading
        ? "checking"
        : inspection.isError || !inspection.data
          ? (invitationStateOf(inspection.error) ?? "invalid")
          : !inspection.data.usable
            ? stageOfStatus(inspection.data.status)
            : acceptance.isSuccess
              ? "success"
              : "form";

  const onFail = (error: unknown) => {
    const state = invitationStateOf(error);

    if (state) {
      setFrozenState(state);
      return;
    }

    setFailure(t(`team.invite.errors.${classifyTeamError(error).key}`));
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (acceptance.isPending || !token) return;
    setFailure(null);

    const formErrors = validateAcceptForm(values, role, t);
    if (Object.keys(formErrors).length > 0) {
      setErrors(formErrors);
      return;
    }
    setErrors({});

    try {
      await acceptance.mutateAsync(buildAcceptPayload(values, token));
    } catch (error) {
      onFail(error);
    }
  };

  // The labels of the two password fields, as the register forms word them.
  const passwordLabels = {
    hidePasswordLabel: t("team.invite.form.hidePassword"),
    hint: t("team.invite.form.passwordHint"),
    showPasswordLabel: t("team.invite.form.showPassword"),
    strengthLabel: t("team.invite.form.strength"),
    strengthLabels: {
      medium: t("team.invite.form.strengthLevels.medium"),
      strong: t("team.invite.form.strengthLevels.strong"),
      weak: t("team.invite.form.strengthLevels.weak"),
    },
  };

  return (
    <div>
      {stage === "checking" ? (
        <p
          className="py-6 text-center text-sm text-[var(--text-secondary)]"
          role="status"
        >
          {t("team.invite.checking")}
        </p>
      ) : null}

      {stage === "form" && inspection.data ? (
        <form
          className="space-y-4"
          noValidate
          onSubmit={(event) => void submit(event)}
          aria-busy={acceptance.isPending}
        >
          <div className="rounded-[var(--radius-sm)] border border-[var(--line-soft)] bg-[var(--surface-muted)] p-3 text-xs leading-5 text-[var(--text-secondary)]">
            <p className="font-semibold text-[var(--text-primary)]">
              {t("team.invite.inspection.card")}
            </p>
            <p className="mt-1">
              <span className="font-medium text-[var(--text-primary)]">
                {t("team.invite.inspection.establishment")} :{" "}
              </span>
              {inspection.data.establishmentName} —{" "}
              {t("team.invite.inspection.workspace")} :{" "}
              {inspection.data.workspaceName}
            </p>
            <p>
              <span className="font-medium text-[var(--text-primary)]">
                {t("team.invite.inspection.role")} :{" "}
              </span>
              {t(`team.members.roles.${role}`)}
            </p>
            <p>
              <span className="font-medium text-[var(--text-primary)]">
                {t(`team.invite.inspection.status.${inspection.data.status}`)}
              </span>
            </p>
            <p dir="ltr">{inspection.data.email}</p>
            <p>
              {t("team.invite.inspection.expiresOn", {
                date: formatTeamDate(inspection.data.expiresAt, locale),
              })}
            </p>
          </div>

          <div>
            <Label
              className="text-[.8rem] font-medium text-[var(--text-primary)]"
              htmlFor="invite-accept-fullName"
            >
              {t("team.invite.form.fullName")}
            </Label>
            <Input
              aria-invalid={errors.fullName ? true : undefined}
              className={acceptFieldClass}
              dir="auto"
              id="invite-accept-fullName"
              onChange={(event) => change("fullName")(event.target.value)}
              value={values.fullName}
            />
            {errors.fullName ? (
              <FieldAlert
                id="invite-accept-fullName-error"
                message={errors.fullName}
              />
            ) : null}
          </div>

          <div>
            <Label
              className="text-[.8rem] font-medium text-[var(--text-primary)]"
              htmlFor="invite-accept-phone"
            >
              {t("team.invite.form.phone")}
            </Label>
            <Input
              aria-invalid={errors.phone ? true : undefined}
              className={acceptFieldClass}
              dir="ltr"
              id="invite-accept-phone"
              inputMode="tel"
              onChange={(event) => change("phone")(event.target.value)}
              value={values.phone}
            />
            {errors.phone ? (
              <FieldAlert
                id="invite-accept-phone-error"
                message={errors.phone}
              />
            ) : null}
          </div>

          <div className="space-y-4">
            <PasswordInput
              id="invite-accept-password"
              label={t("team.invite.form.password")}
              direction={direction}
              error={errors.password}
              aria-invalid={errors.password ? true : undefined}
              strengthValue={values.password}
              value={values.password}
              onChange={(event) => change("password")(event.target.value)}
              {...passwordLabels}
            />

            <PasswordInput
              id="invite-accept-confirmPassword"
              label={t("team.invite.form.confirmPassword")}
              direction={direction}
              showStrength={false}
              error={errors.confirmPassword}
              aria-invalid={errors.confirmPassword ? true : undefined}
              value={values.confirmPassword}
              onChange={(event) =>
                change("confirmPassword")(event.target.value)
              }
              {...passwordLabels}
            />
          </div>

          {role === "DOCTOR" ? (
            <fieldset className="space-y-3 rounded-[var(--radius-sm)] border border-[var(--line-soft)] p-3">
              <legend className="px-1 text-xs font-semibold text-[var(--text-primary)]">
                {t("team.invite.form.professionalTitle")}
              </legend>
              <p className="text-[0.7rem] text-[var(--text-secondary)]">
                {t("team.invite.form.professionalSubtitle")}
              </p>
              <div>
                <Label
                  className="text-[.8rem] font-medium text-[var(--text-primary)]"
                  htmlFor="invite-accept-speciality"
                >
                  {t("team.invite.form.speciality")}
                </Label>
                <Input
                  className={acceptFieldClass}
                  dir="auto"
                  id="invite-accept-speciality"
                  onChange={(event) => change("speciality")(event.target.value)}
                  value={values.speciality}
                />
              </div>
              <div>
                <Label
                  className="text-[.8rem] font-medium text-[var(--text-primary)]"
                  htmlFor="invite-accept-wilaya"
                >
                  {t("team.invite.form.wilaya")}
                </Label>
                <Select
                  className={acceptFieldClass}
                  id="invite-accept-wilaya"
                  onChange={(event) => change("wilaya")(event.target.value)}
                  value={values.wilaya}
                >
                  <option value=""></option>
                  {ALGERIAN_WILAYAS.map((wilaya) => (
                    <option key={wilaya} value={wilaya}>
                      {wilaya}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label
                  className="text-[.8rem] font-medium text-[var(--text-primary)]"
                  htmlFor="invite-accept-professionalAddress"
                >
                  {t("team.invite.form.professionalAddress")}
                </Label>
                <Input
                  className={acceptFieldClass}
                  dir="auto"
                  id="invite-accept-professionalAddress"
                  onChange={(event) =>
                    change("professionalAddress")(event.target.value)
                  }
                  value={values.professionalAddress}
                />
              </div>
            </fieldset>
          ) : null}

          {failure ? (
            <p
              className="rounded-[var(--radius-sm)] border border-[var(--danger-line)] bg-[var(--danger-soft)] px-3 py-2 text-xs text-[var(--danger-ink)]"
              role="alert"
            >
              {failure}
            </p>
          ) : null}

          <button
            className="clinical-button clinical-button-primary w-full text-sm"
            disabled={acceptance.isPending}
            type="submit"
          >
            {acceptance.isPending
              ? t("team.invite.form.creating")
              : t("team.invite.form.submit")}
          </button>
        </form>
      ) : null}

      {stage === "invalid" ||
      stage === "expired" ||
      stage === "revoked" ||
      stage === "used" ? (
        <InvitationStateCard
          message={t(`team.invite.states.${stage}`)}
          success={false}
          title={t(`team.invite.states.${stage}Title`)}
          t={t}
        />
      ) : null}

      {stage === "success" ? (
        <InvitationStateCard
          message={t("team.invite.states.success")}
          success
          title={t("team.invite.states.successTitle")}
          t={t}
        >
          <Link
            className="clinical-button clinical-button-primary mt-4 text-xs"
            href={loginHref}
          >
            {t("team.invite.states.goLogin")}
          </Link>
        </InvitationStateCard>
      ) : null}
    </div>
  );
}

function stageOfStatus(status: string): Stage {
  if (status === "EXPIRED") return "expired";
  if (status === "REVOKED") return "revoked";
  if (status === "USED") return "used";

  return "invalid";
}

function FieldAlert({ id, message }: { id: string; message: string }) {
  return (
    <p className="mt-1 text-xs text-[var(--danger-ink)]" id={id} role="alert">
      {message}
    </p>
  );
}

// One whole-screen answer: the refusal of a link, or the welcome of an
// account that now exists.
function InvitationStateCard({
  children,
  message,
  success,
  title,
  t,
}: {
  children?: React.ReactNode;
  message: string;
  success: boolean;
  t: TranslationFunction;
  title: string;
}) {
  const Icon = success ? CheckCircle2 : AlertTriangle;

  return (
    <div
      className="flex flex-col items-center px-4 py-6 text-center"
      role={success ? "status" : "alert"}
    >
      <Icon
        aria-hidden="true"
        className={
          success ? "text-[var(--success-ink)]" : "text-[var(--danger-ink)]"
        }
        size={30}
        strokeWidth={1.6}
      />
      <h1 className="mt-3 text-base font-semibold text-[var(--text-primary)]">
        {title}
      </h1>
      <p className="mt-2 max-w-md text-xs leading-5 text-[var(--text-secondary)]">
        {message}
      </p>
      {children}
      {success ? null : (
        <Link className="clinical-button mt-4 text-xs" href={loginHref}>
          {t("team.invite.states.backToLogin")}
        </Link>
      )}
    </div>
  );
}
