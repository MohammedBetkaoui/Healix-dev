"use client";

import { Ban, RotateCcw, TriangleAlert, X } from "lucide-react";
import { useId } from "react";

import { useReactivateAffiliatedDoctor } from "@/features/doctors/hooks/use-reactivate-affiliated-doctor";
import { useSuspendAffiliatedDoctor } from "@/features/doctors/hooks/use-suspend-affiliated-doctor";
import { type Locale } from "@/i18n";
import { getServerErrorMessage } from "@/lib/api/get-server-error-message";
import { type Direction } from "@/lib/i18n";

type ToggleDoctorStatusAction = "suspend" | "reactivate";

type ToggleDoctorStatusModalProps = {
  action: ToggleDoctorStatusAction;
  direction: Direction;
  doctorId: string;
  doctorName: string;
  isOpen: boolean;
  locale: Locale;
  onClose: () => void;
  onDone: () => void;
};

const modalCopy = {
  fr: {
    actions: {
      reactivate: {
        confirmMessage: (doctorName: string) =>
          `Réactiver l’accès de ${doctorName} ? Il pourra à nouveau se connecter.`,
        pending: "Réactivation…",
        submitError: "Le médecin n’a pas pu être réactivé. Veuillez réessayer.",
        title: "Réactiver l’accès",
      },
      suspend: {
        confirmMessage: (doctorName: string) =>
          `Suspendre l’accès de ${doctorName} ? Il ne pourra plus se connecter et ses sessions actives seront immédiatement déconnectées.`,
        pending: "Suspension…",
        submitError: "Le médecin n’a pas pu être suspendu. Veuillez réessayer.",
        title: "Suspendre l’accès",
      },
    },
    cancel: "Annuler",
    close: "Fermer",
    confirm: "Confirmer",
  },
  ar: {
    actions: {
      reactivate: {
        confirmMessage: (doctorName: string) =>
          `إعادة تفعيل وصول ${doctorName}؟ سيتمكن من تسجيل الدخول مجددًا.`,
        pending: "جارٍ إعادة التفعيل…",
        submitError: "تعذرت إعادة تفعيل الطبيب. يرجى إعادة المحاولة.",
        title: "إعادة تفعيل الوصول",
      },
      suspend: {
        confirmMessage: (doctorName: string) =>
          `إيقاف وصول ${doctorName}؟ لن يتمكن من تسجيل الدخول وسيتم تسجيل خروجه فورًا من جميع جلساته النشطة.`,
        pending: "جارٍ الإيقاف…",
        submitError: "تعذر إيقاف الطبيب. يرجى إعادة المحاولة.",
        title: "إيقاف الوصول",
      },
    },
    cancel: "إلغاء",
    close: "إغلاق",
    confirm: "تأكيد",
  },
} as const;

export function ToggleDoctorStatusModal({
  isOpen,
  ...dialogProps
}: ToggleDoctorStatusModalProps) {
  // Mounting the dialog only while open gives every opening fresh state
  // (no stale error or mutation) without resetting it in an effect.
  if (!isOpen) return null;

  return <ToggleDoctorStatusDialog {...dialogProps} />;
}

function ToggleDoctorStatusDialog({
  action,
  direction,
  doctorId,
  doctorName,
  locale,
  onClose,
  onDone,
}: Omit<ToggleDoctorStatusModalProps, "isOpen">) {
  const copy = modalCopy[locale];
  const actionCopy = copy.actions[action];
  const baseId = useId();
  const ids = {
    description: `${baseId}-description`,
    title: `${baseId}-title`,
  };
  // Both hooks are always called (rules of hooks); `action` picks which one runs.
  const suspendMutation = useSuspendAffiliatedDoctor();
  const reactivateMutation = useReactivateAffiliatedDoctor();
  const statusMutation = action === "suspend" ? suspendMutation : reactivateMutation;
  const ActionIcon = action === "suspend" ? Ban : RotateCcw;
  const isLocked = statusMutation.isPending;

  const confirmToggle = () => {
    statusMutation.mutate(doctorId, {
      onSuccess: () => {
        onDone();
        onClose();
      },
    });
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
              <span className="healix-mark"><ActionIcon size={18} strokeWidth={1.8} aria-hidden="true" /></span>
              <div>
                <h2 id={ids.title} className="text-base font-semibold text-[var(--text-primary)]">
                  {actionCopy.title}
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

          <div className="space-y-5 px-6 py-5">
            <p id={ids.description} className="text-sm leading-relaxed text-[var(--text-primary)]">
              {actionCopy.confirmMessage(doctorName)}
            </p>

            {statusMutation.isError ? (
              <p role="alert" className="flex items-start gap-2 rounded-[var(--radius-sm)] border border-[var(--danger-line)] bg-[var(--danger-soft)] px-3 py-2.5 text-xs leading-relaxed text-[var(--danger-ink)]">
                <TriangleAlert size={15} strokeWidth={1.8} className="mt-px shrink-0" aria-hidden="true" />
                {getServerErrorMessage(statusMutation.error) ?? actionCopy.submitError}
              </p>
            ) : null}
          </div>

          <footer className="flex flex-col-reverse gap-2 border-t border-[var(--border)] bg-[var(--surface-muted)] px-6 py-4 sm:flex-row sm:justify-end">
            <button type="button" className="clinical-button disabled:cursor-not-allowed disabled:opacity-60" onClick={onClose} disabled={isLocked}>{copy.cancel}</button>
            <button type="button" className="clinical-button clinical-button-primary disabled:cursor-not-allowed disabled:opacity-60" onClick={confirmToggle} disabled={isLocked}>
              <ActionIcon size={16} strokeWidth={1.8} aria-hidden="true" />
              {isLocked ? actionCopy.pending : copy.confirm}
            </button>
          </footer>
        </div>
      </div>
    </div>
  );
}
