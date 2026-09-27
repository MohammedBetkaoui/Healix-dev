"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Check, Copy, KeyRound, TriangleAlert, UserRoundPlus, X } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useCreateAffiliatedDoctor } from "@/features/doctors/hooks/use-create-affiliated-doctor";
import { type CreateAffiliatedDoctorResult } from "@/features/doctors/doctors.types";
import { type Locale } from "@/i18n";
import { getServerErrorMessage } from "@/lib/api/get-server-error-message";
import { type Direction } from "@/lib/i18n";
import { ALGERIAN_WILAYAS } from "@/types/auth";

type AddDoctorModalProps = {
  direction: Direction;
  isOpen: boolean;
  locale: Locale;
  onClose: () => void;
  onCreated: () => void;
};

type DoctorFormValues = {
  email: string;
  fullName: string;
  phone: string;
  professionalAddress: string;
  speciality: string;
  wilaya: string;
};

const modalCopy = {
  fr: {
    cancel: "Annuler",
    close: "Fermer",
    copied: "Copié !",
    copy: "Copier",
    create: "Ajouter le médecin",
    creating: "Création…",
    errors: {
      email: "Email invalide.",
      fullName: "Le nom complet est obligatoire.",
      phone: "Le téléphone est obligatoire.",
      professionalAddress: "L’adresse professionnelle est obligatoire.",
      speciality: "La spécialité est obligatoire.",
      wilaya: "La wilaya est obligatoire.",
    },
    fields: {
      email: "Email professionnel",
      fullName: "Nom complet",
      phone: "Téléphone",
      professionalAddress: "Adresse professionnelle",
      speciality: "Spécialité",
      wilaya: "Wilaya",
    },
    selectWilaya: "Choisir une wilaya",
    speciality: "Ex : Cardiologie",
    submitError: "Le médecin n’a pas pu être créé. Veuillez réessayer.",
    subtitle: "Créez un compte médecin rattaché à votre établissement.",
    successBanner: "Ce mot de passe ne sera plus jamais affiché — communiquez-le au médecin maintenant.",
    successClose: "J’ai noté le mot de passe, fermer",
    successFields: { email: "Email", password: "Mot de passe temporaire" },
    successTitle: "Médecin créé avec succès",
    title: "Ajouter un médecin",
  },
  ar: {
    cancel: "إلغاء",
    close: "إغلاق",
    copied: "تم النسخ!",
    copy: "نسخ",
    create: "إضافة الطبيب",
    creating: "جارٍ الإنشاء…",
    errors: {
      email: "البريد الإلكتروني غير صالح.",
      fullName: "الاسم الكامل مطلوب.",
      phone: "رقم الهاتف مطلوب.",
      professionalAddress: "العنوان المهني مطلوب.",
      speciality: "التخصص مطلوب.",
      wilaya: "الولاية مطلوبة.",
    },
    fields: {
      email: "البريد الإلكتروني المهني",
      fullName: "الاسم الكامل",
      phone: "الهاتف",
      professionalAddress: "العنوان المهني",
      speciality: "التخصص",
      wilaya: "الولاية",
    },
    selectWilaya: "اختر ولاية",
    speciality: "مثال: أمراض القلب",
    submitError: "تعذر إنشاء حساب الطبيب. يرجى إعادة المحاولة.",
    subtitle: "أنشئ حساب طبيب منتسب إلى مؤسستك.",
    successBanner: "لن تظهر كلمة المرور هذه مرة أخرى — أبلغ بها الطبيب الآن.",
    successClose: "لقد دوّنت كلمة المرور، إغلاق",
    successFields: { email: "البريد الإلكتروني", password: "كلمة المرور المؤقتة" },
    successTitle: "تم إنشاء حساب الطبيب بنجاح",
    title: "إضافة طبيب",
  },
} as const;

type ModalCopy = (typeof modalCopy)[Locale];

function createDoctorFormSchema(copy: ModalCopy) {
  return z.object({
    email: z.string().trim().min(1, copy.errors.email).email(copy.errors.email).max(191),
    fullName: z.string().trim().min(2, copy.errors.fullName).max(120),
    phone: z
      .string()
      .trim()
      .min(1, copy.errors.phone)
      .regex(/^\+?[0-9\s().-]{7,20}$/, copy.errors.phone)
      .max(32),
    professionalAddress: z.string().trim().min(5, copy.errors.professionalAddress).max(255),
    speciality: z.string().trim().min(2, copy.errors.speciality).max(100),
    wilaya: z.string().min(1, copy.errors.wilaya),
  });
}

function getDefaultValues(): DoctorFormValues {
  return {
    email: "",
    fullName: "",
    phone: "",
    professionalAddress: "",
    speciality: "",
    wilaya: "",
  };
}

const fieldClass = "h-[42px] rounded-[var(--radius-sm)] border-[var(--border)] bg-[var(--surface)] text-sm text-[var(--text-primary)] shadow-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]";
const labelClass = "text-[.8rem] font-medium text-[var(--text-primary)]";

function RequiredMark() {
  return <span aria-hidden="true" className="text-[var(--danger-ink)]"> *</span>;
}

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? <p id={id} className="text-xs text-[var(--danger-ink)]">{message}</p> : null;
}

export function AddDoctorModal({
  direction,
  isOpen,
  locale,
  onClose,
  onCreated,
}: AddDoctorModalProps) {
  const copy = modalCopy[locale];
  const baseId = useId();
  const ids = {
    address: `${baseId}-address`,
    email: `${baseId}-email`,
    fullName: `${baseId}-fullName`,
    phone: `${baseId}-phone`,
    speciality: `${baseId}-speciality`,
    subtitle: `${baseId}-subtitle`,
    title: `${baseId}-title`,
    wilaya: `${baseId}-wilaya`,
  };
  const schema = useMemo(() => createDoctorFormSchema(copy), [copy]);
  const createDoctorMutation = useCreateAffiliatedDoctor();
  const [result, setResult] = useState<CreateAffiliatedDoctorResult | null>(null);
  const [isCopied, setCopied] = useState(false);
  const {
    formState: { errors },
    handleSubmit,
    register,
    reset,
  } = useForm<DoctorFormValues>({
    defaultValues: getDefaultValues(),
    resolver: zodResolver(schema),
  });

  useEffect(() => {
    if (isOpen) {
      reset(getDefaultValues());
      createDoctorMutation.reset();
      setResult(null);
      setCopied(false);
    }
    // createDoctorMutation is a fresh object identity on every render; only
    // .reset needs to run once when the modal opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, reset]);

  if (!isOpen) return null;

  const closeModal = () => {
    reset(getDefaultValues());
    createDoctorMutation.reset();
    setResult(null);
    setCopied(false);
    onClose();
  };

  const submit = (values: DoctorFormValues) => {
    createDoctorMutation.mutate(values, {
      onSuccess: (created) => {
        setResult(created);
        onCreated();
      },
    });
  };

  const copyPassword = async () => {
    if (!result) return;

    try {
      await navigator.clipboard.writeText(result.temporaryPassword);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be denied by the browser; the password stays
      // visible on screen either way, so this is not a hard failure.
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-[var(--scrim)]"
      role="presentation"
      onKeyDown={(event) => {
        if (event.key === "Escape" && !result) {
          event.stopPropagation();
          closeModal();
        }
      }}
    >
      <div className="flex min-h-full items-start justify-center p-4 sm:items-center sm:p-6">
        <div
          aria-describedby={ids.subtitle}
          aria-labelledby={ids.title}
          aria-modal="true"
          className="surface-section surface-raised w-full max-w-xl overflow-hidden"
          dir={direction}
          role="dialog"
        >
          <header className="flex items-start justify-between gap-4 border-b border-[var(--border)] px-6 py-5">
            <div className="flex items-start gap-3">
              <span className="healix-mark"><UserRoundPlus size={18} strokeWidth={1.8} aria-hidden="true" /></span>
              <div>
                <h2 id={ids.title} className="text-base font-semibold text-[var(--text-primary)]">
                  {result ? copy.successTitle : copy.title}
                </h2>
                <p id={ids.subtitle} className="clinical-caption mt-0.5">{copy.subtitle}</p>
              </div>
            </div>
            {result ? null : (
              <button type="button" className="clinical-icon-button -me-2 -mt-1.5 shrink-0" onClick={closeModal} aria-label={copy.close}>
                <X size={18} strokeWidth={1.8} aria-hidden="true" />
              </button>
            )}
          </header>

          {result ? (
            <>
              <div className="space-y-5 px-6 py-5">
                <div className="rounded-[var(--radius-sm)] border border-[var(--warning-line)] bg-[var(--warning-soft)] p-4">
                  <p className="flex items-start gap-2 text-xs leading-relaxed text-[var(--warning-ink)]">
                    <TriangleAlert size={15} strokeWidth={1.8} className="mt-px shrink-0" aria-hidden="true" />
                    {copy.successBanner}
                  </p>

                  <dl className="mt-4 space-y-3">
                    <div>
                      <dt className="clinical-caption">{copy.successFields.email}</dt>
                      <dd className="mt-1 text-sm text-[var(--text-primary)]"><bdi dir="ltr">{result.doctorProfile.email}</bdi></dd>
                    </div>
                    <div>
                      <dt className="clinical-caption">{copy.successFields.password}</dt>
                      <dd className="mt-1 flex items-center gap-2">
                        <code dir="ltr" className="flex-1 truncate rounded-[var(--radius-xs)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-semibold text-[var(--text-primary)]">
                          {result.temporaryPassword}
                        </code>
                        <button type="button" className="clinical-button shrink-0" onClick={() => { void copyPassword(); }}>
                          {isCopied ? <Check size={16} strokeWidth={1.8} className="text-[var(--success-ink)]" aria-hidden="true" /> : <Copy size={16} strokeWidth={1.8} aria-hidden="true" />}
                          {isCopied ? copy.copied : copy.copy}
                        </button>
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>

              <footer className="flex justify-end border-t border-[var(--border)] bg-[var(--surface-muted)] px-6 py-4">
                <button type="button" className="clinical-button clinical-button-primary" onClick={closeModal}>
                  <KeyRound size={16} strokeWidth={1.8} aria-hidden="true" />
                  {copy.successClose}
                </button>
              </footer>
            </>
          ) : (
            <form onSubmit={handleSubmit(submit)} noValidate>
              <div className="space-y-5 px-6 py-5">
                <div className="space-y-1.5">
                  <Label htmlFor={ids.fullName} className={labelClass}>{copy.fields.fullName}<RequiredMark /></Label>
                  <Input id={ids.fullName} className={fieldClass} aria-invalid={errors.fullName ? true : undefined} aria-describedby={errors.fullName ? `${ids.fullName}-error` : undefined} {...register("fullName")} />
                  <FieldError id={`${ids.fullName}-error`} message={errors.fullName?.message} />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor={ids.speciality} className={labelClass}>{copy.fields.speciality}<RequiredMark /></Label>
                    <Input id={ids.speciality} className={fieldClass} placeholder={copy.speciality} aria-invalid={errors.speciality ? true : undefined} aria-describedby={errors.speciality ? `${ids.speciality}-error` : undefined} {...register("speciality")} />
                    <FieldError id={`${ids.speciality}-error`} message={errors.speciality?.message} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={ids.wilaya} className={labelClass}>{copy.fields.wilaya}<RequiredMark /></Label>
                    <Select id={ids.wilaya} className={fieldClass} aria-invalid={errors.wilaya ? true : undefined} aria-describedby={errors.wilaya ? `${ids.wilaya}-error` : undefined} {...register("wilaya")}>
                      <option value="">{copy.selectWilaya}</option>
                      {ALGERIAN_WILAYAS.map((wilaya) => (
                        <option key={wilaya} value={wilaya}>{wilaya}</option>
                      ))}
                    </Select>
                    <FieldError id={`${ids.wilaya}-error`} message={errors.wilaya?.message} />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor={ids.address} className={labelClass}>{copy.fields.professionalAddress}<RequiredMark /></Label>
                  <Input id={ids.address} className={fieldClass} aria-invalid={errors.professionalAddress ? true : undefined} aria-describedby={errors.professionalAddress ? `${ids.address}-error` : undefined} {...register("professionalAddress")} />
                  <FieldError id={`${ids.address}-error`} message={errors.professionalAddress?.message} />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor={ids.email} className={labelClass}>{copy.fields.email}<RequiredMark /></Label>
                    <Input id={ids.email} type="email" className={fieldClass} aria-invalid={errors.email ? true : undefined} aria-describedby={errors.email ? `${ids.email}-error` : undefined} {...register("email")} />
                    <FieldError id={`${ids.email}-error`} message={errors.email?.message} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={ids.phone} className={labelClass}>{copy.fields.phone}<RequiredMark /></Label>
                    <Input id={ids.phone} className={fieldClass} aria-invalid={errors.phone ? true : undefined} aria-describedby={errors.phone ? `${ids.phone}-error` : undefined} {...register("phone")} />
                    <FieldError id={`${ids.phone}-error`} message={errors.phone?.message} />
                  </div>
                </div>

                {createDoctorMutation.isError ? (
                  <p role="alert" className="flex items-start gap-2 rounded-[var(--radius-sm)] border border-[var(--danger-line)] bg-[var(--danger-soft)] px-3 py-2.5 text-xs leading-relaxed text-[var(--danger-ink)]">
                    <TriangleAlert size={15} strokeWidth={1.8} className="mt-px shrink-0" aria-hidden="true" />
                    {getServerErrorMessage(createDoctorMutation.error) ?? copy.submitError}
                  </p>
                ) : null}
              </div>

              <footer className="flex flex-col-reverse gap-2 border-t border-[var(--border)] bg-[var(--surface-muted)] px-6 py-4 sm:flex-row sm:justify-end">
                <button type="button" className="clinical-button" onClick={closeModal}>{copy.cancel}</button>
                <button type="submit" className="clinical-button clinical-button-primary disabled:cursor-not-allowed disabled:opacity-60" disabled={createDoctorMutation.isPending}>
                  <UserRoundPlus size={16} strokeWidth={1.8} aria-hidden="true" />
                  {createDoctorMutation.isPending ? copy.creating : copy.create}
                </button>
              </footer>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
