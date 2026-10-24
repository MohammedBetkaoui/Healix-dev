"use client";

import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  isSubscriptionActionConflict,
  useAdminSubscriptionAction,
} from "@/features/admin/hooks/use-admin-subscription-action";
import { type AdminSubscriptionDetail } from "@/features/admin/subscriptions.types";
import {
  ADMIN_REASON_MAX_LENGTH,
  ADMIN_REASON_MIN_LENGTH,
  type AdminActionError,
  type AdminActionForm,
  type AdminActionKind,
  EXTENSION_MAX_DAYS,
  TRIAL_EXTENSION_MAX_DAYS,
  emptyActionForm,
  validateAdminAction,
  type QuotaFieldForm,
} from "@/features/admin/utils/subscription-actions";
import { availableAdminActions } from "@/features/admin/utils/subscription-actions-availability";
import { aiPipelineIds } from "@/features/ai-analyses/ai-analyses.types";
import { type TranslationFunction } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const selectClass = "mt-2 h-11 w-full rounded-xl border border-border bg-card px-3 text-sm";

const numericQuotas = ["aiAnalysesPerMonth", "maxPatients", "maxDoctors"] as const;

function QuotaField({
  field,
  id,
  label,
  onChange,
  t,
}: {
  field: QuotaFieldForm;
  id: string;
  label: string;
  onChange: (next: QuotaFieldForm) => void;
  t: TranslationFunction;
}) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div className="mt-2 flex gap-2">
        <select
          id={id}
          className="h-11 rounded-xl border border-border bg-card px-3 text-sm"
          value={field.mode}
          onChange={(event) => onChange({ ...field, mode: event.target.value as QuotaFieldForm["mode"] })}
        >
          <option value="keep">{t("admin.subscriptions.form.quotaKeep")}</option>
          <option value="unlimited">{t("admin.subscriptions.form.quotaUnlimited")}</option>
          <option value="value">{t("admin.subscriptions.form.quotaValue")}</option>
        </select>
        {field.mode === "value" ? (
          <Input
            aria-label={label}
            inputMode="numeric"
            className="h-11 rounded-xl border-border"
            value={field.value}
            onChange={(event) => onChange({ ...field, value: event.target.value })}
          />
        ) : null}
      </div>
    </div>
  );
}

// The quotas fields shared by "custom quotas" and "contract on quote".
function QuotasFields({
  form,
  idPrefix,
  setForm,
  t,
}: {
  form: AdminActionForm;
  idPrefix: string;
  setForm: (next: AdminActionForm) => void;
  t: TranslationFunction;
}) {
  const pipelines = form.quotas.aiPipelines;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {numericQuotas.map((key) => (
        <QuotaField
          key={key}
          field={form.quotas[key]}
          id={`${idPrefix}-${key}`}
          label={t(`admin.subscriptions.form.quotas.${key}`)}
          onChange={(next) => setForm({ ...form, quotas: { ...form.quotas, [key]: next } })}
          t={t}
        />
      ))}
      <div>
        <Label htmlFor={`${idPrefix}-pipelines`}>{t("admin.subscriptions.form.quotas.aiPipelines")}</Label>
        <select
          id={`${idPrefix}-pipelines`}
          className={selectClass}
          value={pipelines.mode}
          onChange={(event) =>
            setForm({
              ...form,
              quotas: { ...form.quotas, aiPipelines: { ...pipelines, mode: event.target.value as typeof pipelines.mode } },
            })
          }
        >
          <option value="keep">{t("admin.subscriptions.form.quotaKeep")}</option>
          <option value="all">{t("admin.subscriptions.form.pipelinesAll")}</option>
          <option value="some">{t("admin.subscriptions.form.pipelinesSome")}</option>
        </select>
        {pipelines.mode === "some" ? (
          <ul className="mt-2 grid gap-1 text-sm">
            {aiPipelineIds.map((pipeline) => (
              <li key={pipeline}>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={pipelines.selected.includes(pipeline)}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        quotas: {
                          ...form.quotas,
                          aiPipelines: {
                            ...pipelines,
                            selected: event.target.checked
                              ? [...pipelines.selected, pipeline]
                              : pipelines.selected.filter((item) => item !== pipeline),
                          },
                        },
                      })
                    }
                  />
                  {t(`aiAnalyses.pipelines.${pipeline}.name`)}
                </label>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

type SubscriptionActionsPanelProps = {
  detail: AdminSubscriptionDetail;
  t: TranslationFunction;
};

// The cases the automatic flow does not cover: extend a trial, offer days,
// stop an account, fix quotas, activate a contract on quote. Each asks for a
// reason (kept in the history and the audit log) and for a confirmation, and
// is checked here before anything is sent.
export function SubscriptionActionsPanel({ detail, t }: SubscriptionActionsPanelProps) {
  const idPrefix = useId();
  const actions = availableAdminActions(detail);
  const [kind, setKind] = useState<AdminActionKind | null>(null);
  const [form, setForm] = useState<AdminActionForm>(emptyActionForm);
  const [step, setStep] = useState<"confirm" | "form">("form");
  const [error, setError] = useState<AdminActionError | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; tone: "error" | "success" } | null>(null);
  const action = useAdminSubscriptionAction(detail.account.id);

  const choose = (next: AdminActionKind) => {
    setKind(next);
    setForm(emptyActionForm());
    setStep("form");
    setError(null);
    setFeedback(null);
  };

  const review = () => {
    if (!kind) return;
    const invalid = validateAdminAction(kind, form);
    setError(invalid);
    if (!invalid) setStep("confirm");
  };

  const confirm = () => {
    if (!kind) return;
    action.mutate(
      { form, kind },
      {
        onError: (caught) => {
          setFeedback({
            message: t(isSubscriptionActionConflict(caught) ? "admin.subscriptions.errors.conflict" : "admin.subscriptions.errors.generic"),
            tone: "error",
          });
          setStep("form");
        },
        onSuccess: () => {
          setFeedback({ message: t(`admin.subscriptions.actions.${kind}.done`), tone: "success" });
          setKind(null);
          setForm(emptyActionForm());
          setStep("form");
        },
      },
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label={t("admin.subscriptions.detail.actions")}>
        {actions.map((item) => (
          <Button
            key={item}
            type="button"
            variant={kind === item ? "default" : "outline"}
            aria-pressed={kind === item}
            onClick={() => choose(item)}
          >
            {t(`admin.subscriptions.actions.${item}.label`)}
          </Button>
        ))}
      </div>

      {feedback ? (
        <p
          role={feedback.tone === "error" ? "alert" : "status"}
          className={cn(
            "rounded-xl border px-4 py-3 text-sm font-medium",
            feedback.tone === "error"
              ? "border-[var(--danger-line)] bg-[var(--danger-soft)] text-[var(--danger-ink)]"
              : "border-[var(--success-line)] bg-[var(--success-soft)] text-[var(--success-ink)]",
          )}
        >
          {feedback.message}
        </p>
      ) : null}

      {kind ? (
        <form
          className="space-y-4 rounded-2xl border border-border bg-card p-4 shadow-sm"
          onSubmit={(event) => {
            event.preventDefault();
            if (step === "form") review();
            else confirm();
          }}
        >
          <p className="text-sm text-muted-foreground">{t(`admin.subscriptions.actions.${kind}.description`)}</p>

          {step === "form" ? (
            <>
              {kind === "extendTrial" || kind === "extend" ? (
                <div>
                  <Label htmlFor={`${idPrefix}-days`}>
                    {t("admin.subscriptions.form.days", {
                      max: kind === "extendTrial" ? TRIAL_EXTENSION_MAX_DAYS : EXTENSION_MAX_DAYS,
                    })}
                  </Label>
                  <Input
                    id={`${idPrefix}-days`}
                    inputMode="numeric"
                    className="mt-2 rounded-xl border-border"
                    value={form.days}
                    onChange={(event) => setForm({ ...form, days: event.target.value })}
                  />
                </div>
              ) : null}

              {kind === "quotas" ? (
                <>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.resetQuotas}
                      onChange={(event) => setForm({ ...form, resetQuotas: event.target.checked })}
                    />
                    {t("admin.subscriptions.form.resetQuotas")}
                  </label>
                  {form.resetQuotas ? null : <QuotasFields form={form} idPrefix={idPrefix} setForm={setForm} t={t} />}
                </>
              ) : null}

              {kind === "activateCustom" ? (
                <>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <Label htmlFor={`${idPrefix}-plan`}>{t("admin.subscriptions.form.plan")}</Label>
                      <Input
                        id={`${idPrefix}-plan`}
                        className="mt-2 rounded-xl border-border"
                        value={form.planId}
                        onChange={(event) => setForm({ ...form, planId: event.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor={`${idPrefix}-until`}>{t("admin.subscriptions.form.until")}</Label>
                      <Input
                        id={`${idPrefix}-until`}
                        type="date"
                        className="mt-2 rounded-xl border-border"
                        value={form.until}
                        onChange={(event) => setForm({ ...form, until: event.target.value })}
                      />
                    </div>
                  </div>
                  <QuotasFields form={form} idPrefix={idPrefix} setForm={setForm} t={t} />
                </>
              ) : null}

              <div>
                <Label htmlFor={`${idPrefix}-reason`}>
                  {t("admin.subscriptions.form.reason")} <span aria-hidden="true">*</span>
                </Label>
                <Textarea
                  id={`${idPrefix}-reason`}
                  required
                  aria-required="true"
                  aria-invalid={error === "reasonRequired" || error === "reasonTooLong"}
                  aria-describedby={`${idPrefix}-reason-hint`}
                  className="mt-2 rounded-xl border-border"
                  maxLength={ADMIN_REASON_MAX_LENGTH}
                  value={form.reason}
                  onChange={(event) => setForm({ ...form, reason: event.target.value })}
                />
                <p id={`${idPrefix}-reason-hint`} className="mt-1 text-xs text-muted-foreground">
                  {t("admin.subscriptions.form.reasonHint", { min: ADMIN_REASON_MIN_LENGTH })}
                </p>
              </div>

              {error ? (
                <p role="alert" className="text-sm font-medium text-[var(--danger-ink)]">
                  {t(`admin.subscriptions.errors.${error}`, { min: ADMIN_REASON_MIN_LENGTH })}
                </p>
              ) : null}

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setKind(null)}>
                  {t("admin.actions.close")}
                </Button>
                <Button type="submit">{t("admin.subscriptions.form.review")}</Button>
              </div>
            </>
          ) : (
            <>
              <div role="group" aria-label={t("admin.subscriptions.form.confirmTitle")} className="rounded-xl border border-[var(--warning-line)] bg-[var(--warning-soft)] p-4 text-sm text-[var(--warning-ink)]">
                <p className="font-semibold">{t(`admin.subscriptions.actions.${kind}.confirm`)}</p>
                <p className="mt-2">
                  <span className="font-semibold">{t("admin.subscriptions.form.reason")} : </span>
                  {form.reason.trim()}
                </p>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" disabled={action.isPending} onClick={() => setStep("form")}>
                  {t("admin.actions.back")}
                </Button>
                <Button type="submit" disabled={action.isPending}>
                  {t("admin.subscriptions.form.confirm")}
                </Button>
              </div>
            </>
          )}
        </form>
      ) : null}
    </div>
  );
}
