"use client";

import { Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { type FormEvent, useId, useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getRegisterValidationMessages, type TranslationFunction } from "@/lib/i18n";
import { getPasswordStrength, type PasswordStrengthLevel } from "@/lib/security";

import { useChangeAccountPassword } from "../hooks/use-account";
import { emptyPasswordForm, type PasswordFormErrors, type PasswordFormValues, submitPasswordChange } from "../utils/password-form";
import { fieldClass, FieldError, labelClass } from "./AccountFields";
import { InlineMessage, SectionCard } from "./AccountStateViews";

const LEVEL_BARS: Record<PasswordStrengthLevel, string> = {
  medium: "bg-[var(--warning-ink)]",
  strong: "bg-[var(--success-ink)]",
  weak: "bg-[var(--danger-ink)]",
};

type PasswordFieldProps = {
  autoComplete: "current-password" | "new-password";
  error?: string;
  label: string;
  onChange: (value: string) => void;
  showStrength?: boolean;
  t: TranslationFunction;
  value: string;
};

// A password input with its show/hide button, and under it, for a new
// password, the hint and the strength of the registration (getPasswordStrength).
export function PasswordField({ autoComplete, error, label, onChange, showStrength = false, t, value }: PasswordFieldProps) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const strength = getPasswordStrength(value);
  const describedBy = [showStrength ? `${id}-hint ${id}-strength` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;

  return (
    <div>
      <Label htmlFor={id} className={labelClass}>{label}</Label>
      <div className="relative mt-1.5">
        <Input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          maxLength={128}
          dir="ltr"
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`${fieldClass} pe-11`}
        />
        <button
          type="button"
          className="clinical-icon-button absolute end-1 top-1/2 -translate-y-1/2"
          aria-label={visible ? t("register.password.hide") : t("register.password.show")}
          aria-pressed={visible}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
        </button>
      </div>
      {showStrength ? (
        <>
          <p id={`${id}-hint`} className="mt-1.5 text-[0.7rem] text-[var(--text-secondary)]">{t("register.password.hint")}</p>
          <div id={`${id}-strength`} className="mt-2" aria-live="polite">
            <div className="flex h-1 gap-1" aria-hidden="true">
              {[1, 2, 3, 4, 5].map((step) => (
                <span key={step} className={`h-full flex-1 rounded-full ${step <= strength.score && value ? LEVEL_BARS[strength.level] : "bg-[var(--line-soft)]"}`} />
              ))}
            </div>
            <p className="mt-1 text-[0.7rem] font-medium text-[var(--text-secondary)]">{t("register.password.strength")} : {t(`register.password.levels.${strength.level}`)}</p>
          </div>
        </>
      ) : null}
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}

export function PasswordChangeForm({ forgotHref = "/forgot-password", t }: { forgotHref?: string; t: TranslationFunction }) {
  const change = useChangeAccountPassword();
  const [values, setValues] = useState<PasswordFormValues>(emptyPasswordForm);
  const [errors, setErrors] = useState<PasswordFormErrors>({});
  const [notice, setNotice] = useState<{ message: string; tone: "error" | "success" } | null>(null);

  const edit = (field: keyof PasswordFormValues) => (value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setNotice(null);
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (change.isPending) return;
    setNotice(null);

    const outcome = await submitPasswordChange(values, { messages: getRegisterValidationMessages(t), send: change.mutateAsync, t });
    if (outcome.status === "success") {
      setValues(emptyPasswordForm);
      setErrors({});
      const { keptCurrentSession, revokedSessions } = outcome.result;
      const key = !keptCurrentSession ? "successAll" : revokedSessions > 0 ? "success" : "successNoOthers";
      setNotice({ message: t(`account.security.password.${key}`), tone: "success" });
      return;
    }

    setErrors(outcome.errors);
    if (outcome.status === "failed" && outcome.message) setNotice({ message: outcome.message, tone: "error" });
  };

  return (
    <SectionCard title={t("account.security.password.title")} description={t("account.security.password.subtitle")}>
      <form onSubmit={(event) => void onSubmit(event)} noValidate aria-busy={change.isPending} className="max-w-xl space-y-4">
        <PasswordField autoComplete="current-password" label={t("account.security.password.currentLabel")} value={values.currentPassword} onChange={edit("currentPassword")} error={errors.currentPassword} t={t} />
        <PasswordField autoComplete="new-password" label={t("account.security.password.newLabel")} value={values.newPassword} onChange={edit("newPassword")} error={errors.newPassword} showStrength t={t} />
        <PasswordField autoComplete="new-password" label={t("account.security.password.confirmLabel")} value={values.confirmPassword} onChange={edit("confirmPassword")} error={errors.confirmPassword} t={t} />
        {notice ? <InlineMessage message={notice.message} tone={notice.tone} /> : null}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href={forgotHref} className="clinical-link text-xs">{t("account.security.password.forgot")}</Link>
          <button type="submit" className="clinical-button clinical-button-primary" disabled={change.isPending}>
            {change.isPending ? t("account.security.password.submitting") : t("account.security.password.submit")}
          </button>
        </div>
      </form>
    </SectionCard>
  );
}
