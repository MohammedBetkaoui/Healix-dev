"use client";

import { Check, Copy, KeyRound, TriangleAlert, X } from "lucide-react";
import { useId, useState } from "react";

import { useResetAffiliatedDoctorPassword } from "@/features/doctors/hooks/use-reset-affiliated-doctor-password";
import { type ResetAffiliatedDoctorPasswordResult } from "@/features/doctors/doctors.types";
import { type Locale } from "@/i18n";
import { getMutationErrorMessage } from "@/lib/api/get-mutation-error-message";
import { type Direction, useTranslation } from "@/lib/i18n";

type ResetDoctorPasswordModalProps = {
  direction: Direction;
  doctorId: string;
  doctorName: string;
  isOpen: boolean;
  locale: Locale;
  onClose: () => void;
  onReset: () => void;
};

const modalCopy = {
  fr: {
    cancel: "Annuler",
    close: "Fermer",
    confirm: "Confirmer",
    confirmMessage: (doctorName: string) =>
      `Régénérer le mot de passe de ${doctorName} ? L’ancien mot de passe sera invalidé et toutes ses sessions actives seront déconnectées.`,
    copied: "Copié !",
    copy: "Copier",
    resetting: "Régénération…",
    submitError: "Le mot de passe n’a pas pu être régénéré. Veuillez réessayer.",
    successBanner: "Ce mot de passe ne sera plus jamais affiché — communiquez-le au médecin maintenant.",
    successClose: "J’ai noté le mot de passe, fermer",
    successFields: { doctor: "Médecin", password: "Mot de passe temporaire" },
    successTitle: "Mot de passe régénéré avec succès",
    title: "Régénérer le mot de passe",
  },
  ar: {
    cancel: "إلغاء",
    close: "إغلاق",
    confirm: "تأكيد",
    confirmMessage: (doctorName: string) =>
      `إعادة تعيين كلمة مرور ${doctorName}؟ سيتم إبطال كلمة المرور القديمة وتسجيل الخروج من جميع جلساته النشطة.`,
    copied: "تم النسخ!",
    copy: "نسخ",
    resetting: "جارٍ إعادة التعيين…",
    submitError: "تعذرت إعادة تعيين كلمة المرور. يرجى إعادة المحاولة.",
    successBanner: "لن تظهر كلمة المرور هذه مرة أخرى — أبلغ بها الطبيب الآن.",
    successClose: "لقد دوّنت كلمة المرور، إغلاق",
    successFields: { doctor: "الطبيب", password: "كلمة المرور المؤقتة" },
    successTitle: "تمت إعادة تعيين كلمة المرور بنجاح",
    title: "إعادة تعيين كلمة المرور",
  },
} as const;

export function ResetDoctorPasswordModal({
  isOpen,
  ...dialogProps
}: ResetDoctorPasswordModalProps) {
  // Mounting the dialog only while open gives every opening fresh state
  // (no stale password, error or mutation) without resetting it in an effect.
  if (!isOpen) return null;

  return <ResetDoctorPasswordDialog {...dialogProps} />;
}

function ResetDoctorPasswordDialog({
  direction,
  doctorId,
  doctorName,
  locale,
  onClose,
  onReset,
}: Omit<ResetDoctorPasswordModalProps, "isOpen">) {
  const copy = modalCopy[locale];
  const { t } = useTranslation(locale);
  const baseId = useId();
  const ids = {
    description: `${baseId}-description`,
    title: `${baseId}-title`,
  };
  const resetPasswordMutation = useResetAffiliatedDoctorPassword();
  const [result, setResult] = useState<ResetAffiliatedDoctorPasswordResult | null>(null);
  const [isCopied, setCopied] = useState(false);
  // Closing mid-request would reset the password server-side without ever
  // showing the new one, so the modal stays locked until the request settles.
  const isLocked = result !== null || resetPasswordMutation.isPending;

  const confirmReset = () => {
    resetPasswordMutation.mutate(doctorId, {
      onSuccess: (reset) => {
        setResult(reset);
      },
    });
  };

  const finish = () => {
    onReset();
    onClose();
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
        if (event.key === "Escape" && !isLocked) {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="flex min-h-full items-start justify-center p-4 sm:items-center sm:p-6">
        <div
          aria-describedby={ids.description}
          aria-labelledby={ids.title}
          aria-modal="true"
          className="surface-section surface-raised w-full max-w-xl overflow-hidden"
          dir={direction}
          role="dialog"
        >
          <header className="flex items-start justify-between gap-4 border-b border-[var(--border)] px-6 py-5">
            <div className="flex items-start gap-3">
              <span className="healix-mark"><KeyRound size={18} strokeWidth={1.8} aria-hidden="true" /></span>
              <div>
                <h2 id={ids.title} className="text-base font-semibold text-[var(--text-primary)]">
                  {result ? copy.successTitle : copy.title}
                </h2>
                <p className="clinical-caption mt-0.5"><bdi>{doctorName}</bdi></p>
              </div>
            </div>
            {isLocked ? null : (
              <button type="button" className="clinical-icon-button -me-2 -mt-1.5 shrink-0" onClick={onClose} aria-label={copy.close}>
                <X size={18} strokeWidth={1.8} aria-hidden="true" />
              </button>
            )}
          </header>

          {result ? (
            <>
              <div className="space-y-5 px-6 py-5">
                <div className="rounded-[var(--radius-sm)] border border-[var(--warning-line)] bg-[var(--warning-soft)] p-4">
                  <p id={ids.description} className="flex items-start gap-2 text-xs leading-relaxed text-[var(--warning-ink)]">
                    <TriangleAlert size={15} strokeWidth={1.8} className="mt-px shrink-0" aria-hidden="true" />
                    {copy.successBanner}
                  </p>

                  <dl className="mt-4 space-y-3">
                    <div>
                      <dt className="clinical-caption">{copy.successFields.doctor}</dt>
                      <dd className="mt-1 text-sm text-[var(--text-primary)]"><bdi>{doctorName}</bdi></dd>
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
                <button type="button" className="clinical-button clinical-button-primary" onClick={finish}>
                  <KeyRound size={16} strokeWidth={1.8} aria-hidden="true" />
                  {copy.successClose}
                </button>
              </footer>
            </>
          ) : (
            <>
              <div className="space-y-5 px-6 py-5">
                <p id={ids.description} className="text-sm leading-relaxed text-[var(--text-primary)]">
                  {copy.confirmMessage(doctorName)}
                </p>

                {resetPasswordMutation.isError ? (
                  <p role="alert" className="flex items-start gap-2 rounded-[var(--radius-sm)] border border-[var(--danger-line)] bg-[var(--danger-soft)] px-3 py-2.5 text-xs leading-relaxed text-[var(--danger-ink)]">
                    <TriangleAlert size={15} strokeWidth={1.8} className="mt-px shrink-0" aria-hidden="true" />
                    {getMutationErrorMessage(resetPasswordMutation.error, t, copy.submitError)}
                  </p>
                ) : null}
              </div>

              <footer className="flex flex-col-reverse gap-2 border-t border-[var(--border)] bg-[var(--surface-muted)] px-6 py-4 sm:flex-row sm:justify-end">
                <button type="button" className="clinical-button disabled:cursor-not-allowed disabled:opacity-60" onClick={onClose} disabled={resetPasswordMutation.isPending}>{copy.cancel}</button>
                <button type="button" className="clinical-button clinical-button-primary disabled:cursor-not-allowed disabled:opacity-60" onClick={confirmReset} disabled={resetPasswordMutation.isPending}>
                  <KeyRound size={16} strokeWidth={1.8} aria-hidden="true" />
                  {resetPasswordMutation.isPending ? copy.resetting : copy.confirm}
                </button>
              </footer>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
