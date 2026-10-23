import { Lock } from "lucide-react";
import { type ReactNode } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { type TranslationFunction } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const fieldClass = "h-[42px] rounded-[var(--radius-sm)] border-[var(--border)] bg-[var(--surface)] text-sm text-[var(--text-primary)] shadow-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]";
export const labelClass = "text-[.8rem] font-medium text-[var(--text-primary)]";

export function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? <p id={id} role="alert" className="mt-1 text-xs text-[var(--danger-ink)]">{message}</p> : null;
}

type FieldShellProps = {
  children: ReactNode;
  className?: string;
  help?: string;
  id: string;
  label: string;
  locked?: boolean;
  t: TranslationFunction;
};

// A label above a control, its help text under it. A locked field says so by
// an icon and a sentence, not by a greyed-out box alone.
export function FieldShell({ children, className, help, id, label, locked = false, t }: FieldShellProps) {
  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id} className={labelClass}>{label}</Label>
        {locked ? (
          <span className="inline-flex items-center gap-1 text-[0.68rem] font-semibold text-[var(--text-secondary)]">
            <Lock size={12} strokeWidth={2} aria-hidden="true" />
            {t("account.profile.locked")}
          </span>
        ) : null}
      </div>
      <div className="mt-1.5">{children}</div>
      {locked ? <p id={`${id}-help`} className="mt-1 text-[0.7rem] text-[var(--text-secondary)]">{t("account.profile.lockedHelp")}</p> : null}
      {!locked && help ? <p id={`${id}-help`} className="mt-1 text-[0.7rem] text-[var(--text-secondary)]">{help}</p> : null}
    </div>
  );
}

type TextFieldProps = {
  autoComplete?: string;
  className?: string;
  error?: string;
  help?: string;
  id: string;
  inputMode?: "tel" | "text";
  label: string;
  locked?: boolean;
  onChange: (value: string) => void;
  readOnlyValue?: boolean;
  t: TranslationFunction;
  value: string;
  dir?: "ltr" | "rtl";
};

export function TextField({ autoComplete, className, dir, error, help, id, inputMode, label, locked = false, onChange, readOnlyValue = false, t, value }: TextFieldProps) {
  const readOnly = locked || readOnlyValue;
  const describedBy = [error ? `${id}-error` : null, locked || help ? `${id}-help` : null].filter(Boolean).join(" ") || undefined;

  return (
    <FieldShell className={className} help={help} id={id} label={label} locked={locked} t={t}>
      <Input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={locked}
        readOnly={readOnly}
        aria-readonly={readOnly || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        autoComplete={autoComplete}
        inputMode={inputMode}
        // Names and addresses are typed in either script: the text decides.
        dir={dir ?? "auto"}
        className={cn(fieldClass, readOnly && "bg-[var(--surface-muted)] text-[var(--text-secondary)]")}
      />
      <FieldError id={`${id}-error`} message={error} />
    </FieldShell>
  );
}

type SelectFieldProps = {
  error?: string;
  id: string;
  label: string;
  locked?: boolean;
  onChange: (value: string) => void;
  options: readonly { label: string; value: string }[];
  placeholder: string;
  t: TranslationFunction;
  value: string;
};

export function SelectField({ error, id, label, locked = false, onChange, options, placeholder, t, value }: SelectFieldProps) {
  const describedBy = [error ? `${id}-error` : null, locked ? `${id}-help` : null].filter(Boolean).join(" ") || undefined;

  return (
    <FieldShell id={id} label={label} locked={locked} t={t}>
      <Select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={locked}
        aria-readonly={locked || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(fieldClass, locked && "bg-[var(--surface-muted)] text-[var(--text-secondary)]")}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </Select>
      <FieldError id={`${id}-error`} message={error} />
    </FieldShell>
  );
}
