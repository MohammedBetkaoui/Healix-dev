"use client";

import { Ban, RotateCcw, TriangleAlert, X } from "lucide-react";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useReactivateUser } from "@/features/admin/hooks/use-reactivate-user";
import { useSuspendUser } from "@/features/admin/hooks/use-suspend-user";
import { getServerErrorMessage } from "@/lib/api/get-server-error-message";
import { type TranslationFunction } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { type RegisteredUser } from "@/types/admin";

type ToggleUserStatusModalProps = {
  onClose: () => void;
  onDone: () => void;
  t: TranslationFunction;
  user: RegisteredUser | null;
};

// Mirrors backend/src/admin/users/dto/suspend-user.dto.ts (checked after trim).
const REASON_MIN_LENGTH = 5;
const REASON_MAX_LENGTH = 500;

export function ToggleUserStatusModal({
  user,
  ...dialogProps
}: ToggleUserStatusModalProps) {
  // Mounted only while a user is targeted, so every opening starts with a
  // fresh reason and mutation state; keyed by id in case the target changes.
  if (!user) {
    return null;
  }

  return <ToggleUserStatusDialog key={user.id} user={user} {...dialogProps} />;
}

function ToggleUserStatusDialog({
  onClose,
  onDone,
  t,
  user,
}: Omit<ToggleUserStatusModalProps, "user"> & { user: RegisteredUser }) {
  const baseId = useId();
  const ids = {
    description: `${baseId}-description`,
    reason: `${baseId}-reason`,
    reasonHint: `${baseId}-reason-hint`,
    title: `${baseId}-title`,
  };
  // Both hooks are always called (rules of hooks); `action` picks which one runs.
  const suspendMutation = useSuspendUser();
  const reactivateMutation = useReactivateUser();
  const action = user.accountStatus === "SUSPENDED" ? "reactivate" : "suspend";
  const statusMutation = action === "suspend" ? suspendMutation : reactivateMutation;
  const isLocked = statusMutation.isPending;
  const ActionIcon = action === "suspend" ? Ban : RotateCcw;
  const [reason, setReason] = useState("");
  const trimmedReason = reason.trim();
  const isReasonValid =
    trimmedReason.length >= REASON_MIN_LENGTH && trimmedReason.length <= REASON_MAX_LENGTH;
  const canConfirm = action === "reactivate" || isReasonValid;
  const showReasonError = trimmedReason.length > 0 && !isReasonValid;

  const confirm = () => {
    const options = {
      onSuccess: () => {
        onDone();
        onClose();
      },
    };

    if (action === "suspend") {
      if (!isReasonValid) return;
      suspendMutation.mutate({ id: user.id, reason: trimmedReason }, options);
      return;
    }

    reactivateMutation.mutate(user.id, options);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onKeyDown={(event) => {
        if (event.key === "Escape" && !isLocked) {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <button
        type="button"
        aria-label={t("admin.actions.close")}
        className="absolute inset-0 bg-[#0f172a]/35 backdrop-blur-sm"
        disabled={isLocked}
        onClick={onClose}
      />
      <div
        aria-describedby={ids.description}
        aria-labelledby={ids.title}
        aria-modal="true"
        className="relative max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-border bg-card shadow-2xl"
        role="dialog"
      >
        <div className="flex items-start justify-between gap-4 p-6 pb-0">
          <div className="flex items-start gap-4">
            <span
              className={cn(
                "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl",
                action === "suspend"
                  ? "bg-[var(--danger-soft)] text-[var(--danger-ink)]"
                  : "bg-[var(--success-soft)] text-[var(--success-ink)]",
              )}
            >
              <ActionIcon className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h2 id={ids.title} className="text-xl font-semibold text-foreground">
                {t(action === "suspend" ? "admin.users.modal.suspendTitle" : "admin.users.modal.reactivateTitle")}
              </h2>
              <p id={ids.description} className="mt-2 text-sm leading-6 text-muted-foreground">
                {t(
                  action === "suspend" ? "admin.users.modal.suspendConfirm" : "admin.users.modal.reactivateConfirm",
                  { fullName: user.fullName },
                )}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="shrink-0"
            aria-label={t("admin.actions.close")}
            disabled={isLocked}
            onClick={onClose}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>

        <div className="space-y-4 p-6">
          {action === "suspend" ? (
            <div>
              <Label htmlFor={ids.reason}>{t("admin.users.modal.reasonLabel")}</Label>
              <Textarea
                id={ids.reason}
                autoFocus
                className="mt-2 rounded-xl border-border"
                disabled={isLocked}
                maxLength={REASON_MAX_LENGTH}
                placeholder={t("admin.users.modal.reasonPlaceholder")}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                aria-describedby={ids.reasonHint}
                aria-invalid={showReasonError ? true : undefined}
              />
              {/* A visible hint rather than a tooltip: the disabled Button has
                  pointer-events: none, so a title on it would never show. */}
              <p
                id={ids.reasonHint}
                className={cn(
                  "mt-2 text-xs",
                  showReasonError ? "text-[var(--danger-ink)]" : "text-muted-foreground",
                )}
              >
                {t("admin.users.modal.reasonRequired")}
              </p>
            </div>
          ) : null}

          {statusMutation.isError ? (
            <p role="alert" className="flex items-start gap-2 rounded-xl border border-[var(--danger-line)] bg-[var(--danger-soft)] px-3 py-2.5 text-sm text-[var(--danger-ink)]">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {getServerErrorMessage(statusMutation.error) ??
                t(action === "suspend" ? "admin.users.modal.suspendError" : "admin.users.modal.reactivateError")}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-border px-6 py-4 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" disabled={isLocked} onClick={onClose}>
            {t("admin.actions.close")}
          </Button>
          <Button type="button" disabled={isLocked || !canConfirm} onClick={confirm}>
            <ActionIcon className="h-4 w-4" aria-hidden="true" />
            {isLocked
              ? t(action === "suspend" ? "admin.users.modal.suspending" : "admin.users.modal.reactivating")
              : t(action === "suspend" ? "admin.actions.suspend" : "admin.actions.reactivate")}
          </Button>
        </div>
      </div>
    </div>
  );
}
