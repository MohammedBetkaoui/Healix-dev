"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { CreditCard, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  type Direction,
  type TranslationFunction,
} from "@/lib/i18n";
import {
  type AccountType,
  type BillingPeriod,
  type PaymentMethod,
  type SubscriptionContext,
  type SubscriptionPlan,
} from "@/types/subscription";

import { CheckoutSummary } from "./CheckoutSummary";
import { ManualPaymentNotice } from "./ManualPaymentNotice";
import { PaymentMethodSelector } from "./PaymentMethodSelector";
import { PaymentSecurityNotice } from "./PaymentSecurityNotice";

type PaymentCheckoutModalProps = {
  accountType: AccountType;
  billingPeriod: BillingPeriod;
  canCheckout: boolean;
  context: SubscriptionContext;
  direction: Direction;
  error?: string | null;
  isLoading: boolean;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onPaymentMethodChange: (paymentMethod: PaymentMethod) => void;
  paymentMethod?: PaymentMethod;
  plan?: SubscriptionPlan;
  t: TranslationFunction;
};

const focusableSelector = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export function PaymentCheckoutModal({
  accountType,
  billingPeriod,
  canCheckout,
  context,
  direction,
  error,
  isLoading,
  isOpen,
  onClose,
  onConfirm,
  onPaymentMethodChange,
  paymentMethod,
  plan,
  t,
}: PaymentCheckoutModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previouslyFocusedElement = document.activeElement as HTMLElement | null;
    const previousBodyOverflow = document.body.style.overflow;
    const focusFrame = window.requestAnimationFrame(() => {
      closeButtonRef.current?.focus();
    });

    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const focusableElements = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? [],
      );

      if (focusableElements.length === 0) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements.at(-1);

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement?.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousBodyOverflow;
      previouslyFocusedElement?.focus();
    };
  }, [isOpen, onClose]);

  if (!isOpen || !plan || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-[#16211d]/48 p-3 sm:p-6"
      dir={direction}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="payment-modal-title"
        aria-describedby="payment-modal-description"
        tabIndex={-1}
        className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-6xl flex-col overflow-hidden rounded-[1.35rem] rounded-bl-[0.45rem] border border-[var(--line)] bg-[var(--bg)] shadow-[0_34px_90px_-28px_rgba(18,61,50,0.62)] outline-none sm:max-h-[calc(100dvh-3rem)]"
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-[var(--line)] bg-[var(--panel)] px-5 py-4 sm:px-7 sm:py-5">
          <div className="flex min-w-0 items-start gap-3 sm:gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[0.8rem] rounded-bl-[0.28rem] border border-[var(--accent-line)] bg-[var(--accent-soft)] text-[var(--accent-dark)]">
              <CreditCard
                className="h-5 w-5"
                strokeWidth={1.7}
                aria-hidden="true"
              />
            </span>
            <div className="min-w-0">
              <p className="font-[var(--font-auth-mono)] text-[0.62rem] font-medium uppercase tracking-[0.14em] text-[var(--gold-dark)]">
                {t("subscription.header.eyebrow")}
              </p>
              <h2
                id="payment-modal-title"
                className="mt-1 truncate font-[var(--font-auth-display)] text-[1.55rem] font-medium text-[var(--ink)] sm:text-[1.8rem]"
              >
                {t(plan.name)}
              </h2>
              <p
                id="payment-modal-description"
                className="mt-1 text-sm text-[var(--ink-soft)]"
              >
                {t("subscription.checkout.subtitle")}
              </p>
            </div>
          </div>
          <Button
            ref={closeButtonRef}
            type="button"
            variant="outline"
            size="icon"
            className="shrink-0 rounded-full border-[var(--line)] bg-[var(--panel)] text-[var(--ink-soft)] hover:border-[var(--accent-line)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent-dark)]"
            aria-label={t("admin.actions.close")}
            onClick={onClose}
          >
            <X className="h-4 w-4" strokeWidth={1.7} aria-hidden="true" />
          </Button>
        </header>

        <div className="overflow-y-auto overscroll-contain p-4 [scrollbar-color:var(--accent)_transparent] [scrollbar-width:thin] sm:p-6">
          <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(19rem,0.72fr)]">
            <div className="space-y-5">
              <PaymentMethodSelector
                disabled={false}
                onChange={onPaymentMethodChange}
                selectedMethod={paymentMethod}
                t={t}
              />
              <ManualPaymentNotice
                billingPeriod={billingPeriod}
                paymentMethod={paymentMethod}
                plan={plan}
                t={t}
              />
              <PaymentSecurityNotice t={t} />
            </div>
            <div className="xl:sticky xl:top-0">
              <CheckoutSummary
                accountType={accountType}
                billingPeriod={billingPeriod}
                canCheckout={canCheckout}
                context={context}
                isLoading={isLoading}
                onConfirm={onConfirm}
                paymentMethod={paymentMethod}
                plan={plan}
                t={t}
              />
              {error ? (
                <p
                  role="alert"
                  className="mt-4 rounded-[0.9rem] border border-[#e4c5bc] bg-[#fbefeb] p-4 text-sm font-medium text-[#a9463a]"
                >
                  {error}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
