import {
  type FieldErrors,
  type Path,
  type UseFormRegister,
} from "react-hook-form";
import { type ReactNode } from "react";

import { FormErrorMessage } from "@/components/auth/register/FormErrorMessage";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { type Direction } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { type DoctorVerificationFormInput } from "@/features/verification/types/doctor-verification.types";

type Option = {
  label: string;
  value: string;
};

type BaseFieldProps = {
  direction: Direction;
  errors: FieldErrors<DoctorVerificationFormInput>;
  label: string;
  name: Path<DoctorVerificationFormInput>;
  register: UseFormRegister<DoctorVerificationFormInput>;
};

function errorMessage(
  errors: FieldErrors<DoctorVerificationFormInput>,
  name: Path<DoctorVerificationFormInput>,
) {
  return errors[name as keyof DoctorVerificationFormInput]?.message as
    | string
    | undefined;
}

function alignmentClass(direction: Direction) {
  return direction === "rtl" ? "text-right" : "text-left";
}

export function TextField({
  autoComplete,
  direction,
  errors,
  label,
  name,
  placeholder,
  register,
  type = "text",
}: BaseFieldProps & {
  autoComplete?: string;
  placeholder?: string;
  type?: "date" | "email" | "number" | "tel" | "text";
}) {
  const fieldError = errorMessage(errors, name);
  const errorId = `${name}-error`;

  return (
    <div>
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        type={type}
        dir={direction}
        autoComplete={autoComplete}
        placeholder={placeholder}
        className={cn("mt-2", alignmentClass(direction))}
        aria-invalid={Boolean(fieldError)}
        aria-describedby={errorId}
        {...register(name)}
      />
      <FormErrorMessage id={errorId} message={fieldError} />
    </div>
  );
}

export function TextareaField({
  direction,
  errors,
  label,
  name,
  placeholder,
  register,
}: BaseFieldProps & {
  placeholder?: string;
}) {
  const fieldError = errorMessage(errors, name);
  const errorId = `${name}-error`;

  return (
    <div className="md:col-span-2">
      <Label htmlFor={name}>{label}</Label>
      <Textarea
        id={name}
        dir={direction}
        placeholder={placeholder}
        className={cn("mt-2", alignmentClass(direction))}
        aria-invalid={Boolean(fieldError)}
        aria-describedby={errorId}
        {...register(name)}
      />
      <FormErrorMessage id={errorId} message={fieldError} />
    </div>
  );
}

export function SelectField({
  direction,
  errors,
  label,
  name,
  options,
  placeholder,
  register,
}: BaseFieldProps & {
  options: Option[];
  placeholder: string;
}) {
  const fieldError = errorMessage(errors, name);
  const errorId = `${name}-error`;

  return (
    <div>
      <Label htmlFor={name}>{label}</Label>
      <Select
        id={name}
        dir={direction}
        className={cn("mt-2", alignmentClass(direction))}
        aria-invalid={Boolean(fieldError)}
        aria-describedby={errorId}
        {...register(name)}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
      <FormErrorMessage id={errorId} message={fieldError} />
    </div>
  );
}

export function StepCard({
  children,
  subtitle,
  title,
}: {
  children: ReactNode;
  subtitle?: string;
  title: string;
}) {
  return (
    <section className="rounded-xl border border-border/80 bg-card p-6 shadow-sm">
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        {subtitle ? (
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
      <div className="grid gap-4 md:grid-cols-2">{children}</div>
    </section>
  );
}
