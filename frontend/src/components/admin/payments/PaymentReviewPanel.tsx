"use client";

import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { type TranslationFunction } from "@/lib/i18n";
import { type PaymentMethod } from "@/types/subscription";

export type PaymentReviewDecision = "ACTIVATE_CASH" | "APPROVE" | "REJECT";

type PaymentReviewPanelProps = {
  isPending?: boolean;
  method: PaymentMethod;
  onDecision: (
    decision: PaymentReviewDecision,
    input: { adminNote?: string; reason: string },
  ) => void;
  t: TranslationFunction;
};

// Limits of AdminApprovePaymentDto / AdminRejectPaymentDto (the backend trims
// before validating, so the reason minimum is checked on the trimmed text).
const adminNoteMaxLength = 500;
const reasonMinLength = 5;
const reasonMaxLength = 1000;

// activate-cash only accepts MANUAL_CASH and approve only the two proof-based
// methods; any other method can only be refused.
function getPositiveDecision(method: PaymentMethod): PaymentReviewDecision | null {
  if (method === "MANUAL_CASH") {
    return "ACTIVATE_CASH";
  }

  if (method === "MANUAL_POST_TRANSFER" || method === "BARIDIMOB_RECEIPT") {
    return "APPROVE";
  }

  return null;
}

export function PaymentReviewPanel({
  isPending = false,
  method,
  onDecision,
  t,
}: PaymentReviewPanelProps) {
  const adminNoteId = useId();
  const reasonId = useId();
  const [adminNote, setAdminNote] = useState("");
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const positiveDecision = getPositiveDecision(method);

  const decide = (decision: PaymentReviewDecision) => {
    const trimmedReason = reason.trim();

    if (decision === "REJECT" && trimmedReason.length < reasonMinLength) {
      setReasonError(t("admin.payments.detail.review.reasonRequired"));
      return;
    }

    setReasonError(null);
    onDecision(decision, {
      adminNote: adminNote.trim() || undefined,
      reason: trimmedReason,
    });
  };

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div>
        <Label htmlFor={adminNoteId}>{t("admin.payments.detail.fields.adminNote")}</Label>
        <Textarea
          id={adminNoteId}
          aria-describedby={`${adminNoteId}-hint`}
          className="mt-2 rounded-xl border-border"
          maxLength={adminNoteMaxLength}
          value={adminNote}
          onChange={(event) => setAdminNote(event.target.value)}
        />
        <p id={`${adminNoteId}-hint`} className="mt-1 text-xs text-muted-foreground">
          {t("admin.payments.detail.review.adminNoteHint")}
        </p>
      </div>

      <div>
        <Label htmlFor={reasonId}>{t("admin.payments.detail.fields.rejectionReason")}</Label>
        <Textarea
          id={reasonId}
          aria-describedby={reasonError ? `${reasonId}-error` : `${reasonId}-hint`}
          aria-invalid={reasonError ? true : undefined}
          className="mt-2 rounded-xl border-border"
          maxLength={reasonMaxLength}
          value={reason}
          onChange={(event) => {
            setReason(event.target.value);
            setReasonError(null);
          }}
        />
        {reasonError ? (
          <p id={`${reasonId}-error`} role="alert" className="mt-1 text-xs font-medium text-[var(--danger-ink)]">
            {reasonError}
          </p>
        ) : (
          <p id={`${reasonId}-hint`} className="mt-1 text-xs text-muted-foreground">
            {t("admin.payments.detail.review.reasonHint")}
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        {positiveDecision ? (
          <Button type="button" disabled={isPending} onClick={() => decide(positiveDecision)}>
            {positiveDecision === "ACTIVATE_CASH"
              ? t("admin.payments.detail.actions.activateCash")
              : t("admin.actions.approve")}
          </Button>
        ) : null}
        <Button type="button" variant="outline" disabled={isPending} onClick={() => decide("REJECT")}>
          {t("admin.actions.refuse")}
        </Button>
      </div>
    </div>
  );
}
