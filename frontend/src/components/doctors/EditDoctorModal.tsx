"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Edit3, TriangleAlert, X } from "lucide-react";
import { useId, useMemo } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useUpdateAffiliatedDoctor } from "@/features/doctors/hooks/use-update-affiliated-doctor";
import { type AffiliatedDoctor } from "@/features/doctors/doctors.types";
import { type Locale } from "@/i18n";
import { getServerErrorMessage } from "@/lib/api/get-server-error-message";
import { type Direction } from "@/lib/i18n";
import { ALGERIAN_WILAYAS } from "@/types/auth";

type EditDoctorModalProps = {
  direction: Direction;
  doctor: AffiliatedDoctor | null;
  isOpen: boolean;
  locale: Locale;
  onClose: () => void;
  onUpdated: () => void;
};

type EditDoctorFormValues = {
  fullName: string;
  professionalAddress: string;
  speciality: string;
  wilaya: string;
};

const modalCopy = {
  fr: {
    cancel: "Annuler",
    close: "Fermer",
    errors: {
      fullName: "Le nom complet est obligatoire.",
      professionalAddress: "L’adresse professionnelle est obligatoire.",
      speciality: "La spécialité est obligatoire.",
      wilaya: "La wilaya est obligatoire.",
    },
    fields: {
      fullName: "Nom complet",
      professionalAddress: "Adresse professionnelle",
      speciality: "Spécialité",
      wilaya: "Wilaya",
    },
    save: "Enregistrer",
    saving: "Enregistrement…",
    selectWilaya: "Choisir une wilaya",
    speciality: "Ex : Cardiologie",
    submitError: "Le profil du médecin n’a pas pu être mis à jour. Veuillez réessayer.",
    subtitle: "Mettez à jour le profil professionnel de ce médecin.",
    title: "Modifier le profil",
  },
  ar: {
    cancel: "إلغاء",
    close: "إغلاق",
    errors: {
      fullName: "الاسم الكامل مطلوب.",
      professionalAddress: "العنوان المهني مطلوب.",
      speciality: "التخصص مطلوب.",
      wilaya: "الولاية مطلوبة.",
    },
    fields: {
      fullName: "الاسم الكامل",
      professionalAddress: "العنوان المهني",
      speciality: "التخصص",
      wilaya: "الولاية",
    },
    save: "حفظ",
    saving: "جارٍ الحفظ…",
    selectWilaya: "اختر ولاية",
    speciality: "مثال: أمراض القلب",
    submitError: "تعذر تحديث ملف الطبيب. يرجى إعادة المحاولة.",
    subtitle: "حدّث الملف المهني لهذا الطبيب.",
    title: "تعديل الملف",
  },
} as const;

type ModalCopy = (typeof modalCopy)[Locale];

function createEditDoctorFormSchema(copy: ModalCopy) {
  return z.object({
    fullName: z.string().trim().min(2, copy.errors.fullName).max(120),
    professionalAddress: z.string().trim().min(5, copy.errors.professionalAddress).max(255),
    speciality: z.string().trim().min(2, copy.errors.speciality).max(100),
    wilaya: z.string().min(1, copy.errors.wilaya),
  });
}

function getDefaultValues(doctor: AffiliatedDoctor): EditDoctorFormValues {
  return {
    fullName: doctor.fullName,
    professionalAddress: doctor.professionalAddress,
    speciality: doctor.speciality,
    wilaya: doctor.wilaya,
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

export function EditDoctorModal({
  doctor,
  isOpen,
  ...dialogProps
}: EditDoctorModalProps) {
  // Mounting the dialog only while open gives every opening fresh state:
  // useForm's defaultValues are derived from `doctor` on each mount, with no
  // reset-in-effect.
  if (!isOpen || !doctor) return null;

  return <EditDoctorDialog doctor={doctor} {...dialogProps} />;
}

function EditDoctorDialog({
  direction,
  doctor,
  locale,
  onClose,
  onUpdated,
}: Omit<EditDoctorModalProps, "doctor" | "isOpen"> & { doctor: AffiliatedDoctor }) {
  const copy = modalCopy[locale];
  const baseId = useId();
  const ids = {
    address: `${baseId}-address`,
    fullName: `${baseId}-fullName`,
    speciality: `${baseId}-speciality`,
    subtitle: `${baseId}-subtitle`,
    title: `${baseId}-title`,
    wilaya: `${baseId}-wilaya`,
  };
  const schema = useMemo(() => createEditDoctorFormSchema(copy), [copy]);
  const updateDoctorMutation = useUpdateAffiliatedDoctor();
  const isLocked = updateDoctorMutation.isPending;
  const {
    formState: { errors },
    handleSubmit,
    register,
  } = useForm<EditDoctorFormValues>({
    defaultValues: getDefaultValues(doctor),
    resolver: zodResolver(schema),
  });
  // The backend accepts any wilaya string, so a stored value may be missing
  // from the list; keep it selectable instead of silently blanking the field.
  const wilayaOptions: readonly string[] = (ALGERIAN_WILAYAS as readonly string[]).includes(doctor.wilaya)
    ? ALGERIAN_WILAYAS
    : [doctor.wilaya, ...ALGERIAN_WILAYAS];

  const submit = (values: EditDoctorFormValues) => {
    updateDoctorMutation.mutate(
      { id: doctor.id, payload: values },
      {
        onSuccess: () => {
          onUpdated();
          onClose();
        },
      },
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-[var(--scrim)]"
      role="presentation"
      onKeyDown={(event) => {
        if (event.key === "Escape" && !isLocked) {
          event.stopPropagation();
          onClose();
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
              <span className="healix-mark"><Edit3 size={18} strokeWidth={1.8} aria-hidden="true" /></span>
              <div>
                <h2 id={ids.title} className="text-base font-semibold text-[var(--text-primary)]">{copy.title}</h2>
                <p id={ids.subtitle} className="clinical-caption mt-0.5">{copy.subtitle}</p>
              </div>
            </div>
            {isLocked ? null : (
              <button type="button" className="clinical-icon-button -me-2 -mt-1.5 shrink-0" onClick={onClose} aria-label={copy.close}>
                <X size={18} strokeWidth={1.8} aria-hidden="true" />
              </button>
            )}
          </header>

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
                    {wilayaOptions.map((wilaya) => (
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

              {updateDoctorMutation.isError ? (
                <p role="alert" className="flex items-start gap-2 rounded-[var(--radius-sm)] border border-[var(--danger-line)] bg-[var(--danger-soft)] px-3 py-2.5 text-xs leading-relaxed text-[var(--danger-ink)]">
                  <TriangleAlert size={15} strokeWidth={1.8} className="mt-px shrink-0" aria-hidden="true" />
                  {getServerErrorMessage(updateDoctorMutation.error) ?? copy.submitError}
                </p>
              ) : null}
            </div>

            <footer className="flex flex-col-reverse gap-2 border-t border-[var(--border)] bg-[var(--surface-muted)] px-6 py-4 sm:flex-row sm:justify-end">
              <button type="button" className="clinical-button disabled:cursor-not-allowed disabled:opacity-60" onClick={onClose} disabled={isLocked}>{copy.cancel}</button>
              <button type="submit" className="clinical-button clinical-button-primary disabled:cursor-not-allowed disabled:opacity-60" disabled={isLocked}>
                <Edit3 size={16} strokeWidth={1.8} aria-hidden="true" />
                {isLocked ? copy.saving : copy.save}
              </button>
            </footer>
          </form>
        </div>
      </div>
    </div>
  );
}
