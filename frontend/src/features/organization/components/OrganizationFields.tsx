import { Lock } from "lucide-react";
import { type ReactNode } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export const fieldClass =
  "h-[42px] rounded-[var(--radius-sm)] border-[var(--border)] bg-[var(--surface)] text-sm text-[var(--text-primary)] shadow-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]";
export const labelClass = "text-[.8rem] font-medium text-[var(--text-primary)]";

export function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <p id={id} role="alert" className="mt-1 text-xs text-[var(--danger-ink)]">
      {message}
    </p>
  ) : null;
}

type FieldShellProps = {
  children: ReactNode;
  className?: string;
  help?: string;
  id: string;
  label: string;
};

export function FieldShell({
  children,
  className,
  help,
  id,
  label,
}: FieldShellProps) {
  return (
    <div className={className}>
      <Label htmlFor={id} className={labelClass}>
        {label}
      </Label>
      <div className="mt-1.5">{children}</div>
      {help ? (
        <p
          id={`${id}-help`}
          className="mt-1 text-[0.7rem] text-[var(--text-secondary)]"
        >
          {help}
        </p>
      ) : null}
    </div>
  );
}

type TextFieldProps = {
  className?: string;
  error?: string;
  help?: string;
  id: string;
  inputMode?: "tel" | "text";
  label: string;
  onChange: (value: string) => void;
  type?: "email" | "text";
  value: string;
  dir?: "ltr" | "rtl";
};

export function TextField({
  className,
  dir,
  error,
  help,
  id,
  inputMode,
  label,
  onChange,
  type = "text",
  value,
}: TextFieldProps) {
  // Names and addresses are typed in either script: the text decides.
  return (
    <FieldShell className={className} help={help} id={id} label={label}>
      <Input
        id={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={
          [error ? `${id}-error` : null, help ? `${id}-help` : null]
            .filter(Boolean)
            .join(" ") || undefined
        }
        inputMode={inputMode}
        dir={dir ?? "auto"}
        className={cn(fieldClass)}
      />
      <FieldError id={`${id}-error`} message={error} />
    </FieldShell>
  );
}

type SelectFieldProps = {
  className?: string;
  error?: string;
  help?: string;
  id: string;
  label: string;
  onChange: (value: string) => void;
  options: readonly { label: string; value: string }[];
  value: string;
};

export function SelectField({
  className,
  error,
  help,
  id,
  label,
  onChange,
  options,
  value,
}: SelectFieldProps) {
  return (
    <FieldShell className={className} help={help} id={id} label={label}>
      <Select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={
          [error ? `${id}-error` : null, help ? `${id}-help` : null]
            .filter(Boolean)
            .join(" ") || undefined
        }
        className={cn(fieldClass)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
      <FieldError id={`${id}-error`} message={error} />
    </FieldShell>
  );
}

// One HH:mm boundary of a period: the native time picker, always left to
// right even when the page reads from right to left.
export function TimeInput({
  ariaLabel,
  id,
  onChange,
  value,
}: {
  ariaLabel: string;
  id: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <Input
      id={id}
      type="time"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      aria-label={ariaLabel}
      dir="ltr"
      className={cn(fieldClass, "w-[8.5rem]")}
    />
  );
}

export function LockedNote({ children }: { children: ReactNode }) {
  return (
    <p
      className="flex items-start gap-2 text-xs leading-5 text-[var(--text-secondary)]"
      role="note"
    >
      <Lock
        className="mt-0.5 shrink-0 text-[var(--text-secondary)]"
        size={14}
        strokeWidth={1.9}
        aria-hidden="true"
      />
      <span className="max-w-3xl">{children}</span>
    </p>
  );
}
