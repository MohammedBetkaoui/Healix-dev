"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CreditCard, Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type SyntheticChargilyPayload } from "@/features/payments/types/payment.types";
import { type TranslationFunction } from "@/lib/i18n";

const cardSchema = z.object({
  cardHolderName: z.string().min(3),
  cardNumber: z.string().transform((value) => value.replace(/\s+/g, "")).pipe(z.string().regex(/^\d{16}$/)),
  expiryMonth: z.string().regex(/^(0[1-9]|1[0-2])$/),
  expiryYear: z.string().regex(/^\d{4}$/),
  psv: z.string().regex(/^\d{3}$/),
});

type CardFormInput = z.input<typeof cardSchema>;
type CardFormOutput = z.output<typeof cardSchema>;

type SyntheticCardPaymentFormProps = {
  error?: string | null;
  isLoading: boolean;
  onSubmit: (payload: SyntheticChargilyPayload) => void;
  t: TranslationFunction;
};

// The demo card form. The code (PSV) goes to the backend to be checked and is
// never stored there; nothing of the card stays in this page after the answer.
export function SyntheticCardPaymentForm({
  error,
  isLoading,
  onSubmit,
  t,
}: SyntheticCardPaymentFormProps) {
  const form = useForm<CardFormInput, unknown, CardFormOutput>({
    resolver: zodResolver(cardSchema),
    defaultValues: {
      cardHolderName: "",
      cardNumber: "",
      expiryMonth: "",
      expiryYear: "",
      psv: "",
    },
  });

  return (
    <form
      className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.05)]"
      onSubmit={form.handleSubmit((values) => onSubmit(values))}
    >
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#0b3b5f] text-white">
          <CreditCard className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-lg font-semibold text-slate-950">
            {t("subscription.paymentFlow.syntheticTitle")}
          </h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            {t("subscription.paymentFlow.demoNotice")}
          </p>
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-cyan-100 bg-cyan-50/60 p-4 text-sm text-slate-700">
        <p className="font-semibold text-cyan-900">
          {t("subscription.payNow.accepted")}
        </p>
        <p className="mt-2">
          <bdi dir="ltr" className="tabular-nums">
            {t("subscription.paymentFlow.testCardNumber")} -{" "}
            {t("subscription.paymentFlow.testCardExpiry")} -{" "}
            {t("subscription.paymentFlow.testCardPsv")} -{" "}
            {t("subscription.paymentFlow.testCardHolder")}
          </bdi>
        </p>
        <p className="mt-2 text-slate-600">{t("subscription.payNow.declined")}</p>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label htmlFor="cardNumber">
            {t("subscription.paymentFlow.cardNumber")}
          </Label>
          <Input
            id="cardNumber"
            inputMode="numeric"
            autoComplete="cc-number"
            className="mt-2"
            {...form.register("cardNumber")}
          />
        </div>
        <div>
          <Label htmlFor="expiryMonth">
            {t("subscription.paymentFlow.expiry")}
          </Label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Input
              id="expiryMonth"
              placeholder="09"
              inputMode="numeric"
              autoComplete="cc-exp-month"
              {...form.register("expiryMonth")}
            />
            <Input
              placeholder="2030"
              inputMode="numeric"
              autoComplete="cc-exp-year"
              {...form.register("expiryYear")}
            />
          </div>
        </div>
        <div>
          <Label htmlFor="psv">{t("subscription.paymentFlow.psv")}</Label>
          <Input
            id="psv"
            inputMode="numeric"
            autoComplete="cc-csc"
            className="mt-2"
            {...form.register("psv")}
          />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="cardHolderName">
            {t("subscription.paymentFlow.cardHolder")}
          </Label>
          <Input
            id="cardHolderName"
            autoComplete="cc-name"
            className="mt-2"
            {...form.register("cardHolderName")}
          />
        </div>
      </div>

      {error ? (
        <p role="alert" className="mt-4 rounded-2xl bg-rose-50 p-3 text-sm font-medium text-rose-700">
          {error}
        </p>
      ) : null}

      <Button
        type="submit"
        disabled={isLoading}
        className="mt-5 w-full rounded-full"
      >
        {isLoading ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : null}
        {t("subscription.paymentFlow.pay")}
      </Button>
    </form>
  );
}
