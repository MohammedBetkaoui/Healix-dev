"use client";

import { useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type Direction } from "@/lib/i18n";
import {
  getPasswordStrength,
  type PasswordStrengthLevel,
} from "@/lib/security";
import { cn } from "@/lib/utils";

import { FormErrorMessage } from "./FormErrorMessage";
import styles from "./RegisterPage.module.css";

type PasswordInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type"
> & {
  direction: Direction;
  error?: string;
  hidePasswordLabel: string;
  hint: string;
  label: string;
  showStrength?: boolean;
  showPasswordLabel: string;
  strengthLabel: string;
  strengthLabels: Record<PasswordStrengthLevel, string>;
  strengthValue?: string;
};

const strengthStyles = {
  weak: styles.strengthWeak,
  medium: styles.strengthMedium,
  strong: styles.strengthStrong,
};

export function PasswordInput({
  id,
  label,
  direction,
  error,
  hidePasswordLabel,
  hint,
  showPasswordLabel,
  showStrength = true,
  strengthLabel,
  strengthLabels,
  strengthValue = "",
  className,
  ...props
}: PasswordInputProps) {
  const [isVisible, setIsVisible] = useState(false);
  const strength = getPasswordStrength(strengthValue);
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const strengthId = `${id}-strength`;
  const describedBy = [
    showStrength ? hintId : undefined,
    showStrength ? strengthId : undefined,
    error ? errorId : undefined,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div>
      <Label htmlFor={id} className={styles.fieldLabel}>{label}</Label>
      <div className={styles.passwordShell}>
        <Input
          id={id}
          type={isVisible ? "text" : "password"}
          autoComplete="new-password"
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          className={cn(
            styles.fieldControl,
            styles.passwordControl,
            className,
          )}
          dir={direction}
          maxLength={128}
          {...props}
        />
        <button
          type="button"
          aria-label={isVisible ? hidePasswordLabel : showPasswordLabel}
          className={styles.passwordToggle}
          onClick={() => setIsVisible((current) => !current)}
        >
          {isVisible ? (
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M3 3l18 18M10.7 5.2c.4-.1.8-.2 1.3-.2 7 0 10 7 10 7a17 17 0 0 1-2.2 3.2M6.2 6.2C3.5 8.1 2 12 2 12s3 7 10 7c1.3 0 2.5-.2 3.5-.7M9.9 9.9a3 3 0 0 0 4.2 4.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
              <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
            </svg>
          )}
        </button>
      </div>
      {showStrength ? (
        <>
          <p id={hintId} className={styles.passwordHint}>
            {hint}
          </p>
          <div id={strengthId} className={styles.strength} aria-live="polite">
            <div className={styles.strengthBars} aria-hidden="true">
              {[1, 2, 3, 4, 5].map((step) => (
                <span
                  key={step}
                  className={cn(
                    styles.strengthBar,
                    step <= strength.score && strengthStyles[strength.level],
                  )}
                />
              ))}
            </div>
            <p className={styles.strengthText}>
              {strengthLabel} : {strengthLabels[strength.level]}
            </p>
          </div>
        </>
      ) : null}
      <FormErrorMessage id={errorId} message={error} />
    </div>
  );
}
