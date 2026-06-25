"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type Direction } from "@/lib/i18n";
import {
  getPasswordStrength,
  type PasswordStrengthLevel,
} from "@/lib/security";
import { cn } from "@/lib/utils";

import { FormErrorMessage } from "./FormErrorMessage";

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
  weak: "bg-red-500",
  medium: "bg-amber-500",
  strong: "bg-emerald-500",
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
      <Label htmlFor={id}>{label}</Label>
      <div className="relative mt-2">
        <Input
          id={id}
          type={isVisible ? "text" : "password"}
          autoComplete="new-password"
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          className={cn("pe-12 text-start", className)}
          dir={direction}
          maxLength={128}
          {...props}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={isVisible ? hidePasswordLabel : showPasswordLabel}
          className="absolute end-1 top-1/2 h-9 w-9 -translate-y-1/2 text-slate-500 hover:bg-slate-100"
          onClick={() => setIsVisible((current) => !current)}
        >
          {isVisible ? (
            <EyeOff className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Eye className="h-4 w-4" aria-hidden="true" />
          )}
        </Button>
      </div>
      {showStrength ? (
        <>
          <p id={hintId} className="mt-2 text-xs text-slate-500">
            {hint}
          </p>
          <div id={strengthId} className="mt-3" aria-live="polite">
            <div className="flex h-1.5 gap-1" aria-hidden="true">
              {[1, 2, 3, 4, 5].map((step) => (
                <span
                  key={step}
                  className={cn(
                    "h-full flex-1 rounded-full bg-slate-200",
                    step <= strength.score && strengthStyles[strength.level],
                  )}
                />
              ))}
            </div>
            <p className="mt-1 text-xs font-medium text-slate-600">
              {strengthLabel} : {strengthLabels[strength.level]}
            </p>
          </div>
        </>
      ) : null}
      <FormErrorMessage id={errorId} message={error} />
    </div>
  );
}
