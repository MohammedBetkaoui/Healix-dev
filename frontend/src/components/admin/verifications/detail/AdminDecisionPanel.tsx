"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { type TranslationFunction } from "@/lib/i18n";
import { type VerificationDecision } from "@/types/admin";

type AdminDecisionPanelProps = {
  isPending?: boolean;
  onDecision: (decision: VerificationDecision, reason?: string) => void;
  t: TranslationFunction;
};

export function AdminDecisionPanel({
  isPending = false,
  onDecision,
  t,
}: AdminDecisionPanelProps) {
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");

  const approve = () => {
    setError(null);
    if (!confirmed) {
      setError(t("admin.detail.decision.confirmation"));
      return;
    }
    onDecision("APPROVED");
  };

  const reject = () => {
    setError(null);
    if (!confirmed) {
      setError(t("admin.detail.decision.confirmation"));
      return;
    }
    if (rejectionReason.trim().length < 5) {
      setError(t("admin.detail.decision.rejectionRequired"));
      return;
    }
    onDecision("REJECTED", rejectionReason.trim());
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-950">
        {t("admin.detail.decision.title")}
      </h2>
      <div className="mt-5 space-y-4">
        <div>
          <Label htmlFor="rejectionReason">
            {t("admin.detail.decision.rejectionReason")}
          </Label>
          <Textarea
            id="rejectionReason"
            className="mt-2 rounded-xl border-slate-200"
            value={rejectionReason}
            onChange={(event) => setRejectionReason(event.target.value)}
          />
        </div>
        <label className="flex items-start gap-3 text-sm text-slate-700">
          <Checkbox
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
          />
          <span>{t("admin.detail.decision.confirmation")}</span>
        </label>
        {error ? (
          <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-3">
          <Button type="button" disabled={isPending} onClick={approve}>
            {t("admin.actions.approve")}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={reject}
          >
            {t("admin.actions.refuse")}
          </Button>
        </div>
      </div>
    </section>
  );
}
