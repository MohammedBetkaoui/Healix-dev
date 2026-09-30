"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { CreditCard, X } from "lucide-react";

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
      className="fixed inset-0 z-[80] flex items-center justify-center bg-[#0f172a]/48 p-3 sm:p-6"
      dir={direction}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        lang={direction === "rtl" ? "ar" : "fr"}
        role="dialog"
        aria-modal="true"
        aria-labelledby="payment-modal-title"
        aria-describedby="payment-modal-description"
        tabIndex={-1}
        className="dashboard-theme clinical-theme flex max-h-[calc(100dvh-1.5rem)] w-full max-w-5xl flex-col overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-raised)] outline-none sm:max-h-[calc(100dvh-3rem)]"
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-[var(--border)] bg-[var(--surface)] px-5 py-4 sm:px-6">
          <div className="flex min-w-0 items-start gap-3">
            <span className="healix-mark">
              <CreditCard size={18} strokeWidth={1.8} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-medium text-[var(--medical)]">
                {t("subscription.header.eyebrow")}
              </p>
              <h2
                id="payment-modal-title"
                className="mt-0.5 truncate text-lg font-semibold text-[var(--text-primary)]"
              >
                {t(plan.name)}
              </h2>
              <p
                id="payment-modal-description"
                className="clinical-caption mt-0.5"
              >
                {t("subscription.checkout.subtitle")}
              </p>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className="clinical-icon-button -me-2 shrink-0"
            aria-label={t("admin.actions.close")}
            onClick={onClose}
          >
            <X size={18} strokeWidth={1.8} aria-hidden="true" />
          </button>
        </header>

        <div className="overflow-y-auto overscroll-contain bg-[var(--bg)] p-4 [scrollbar-color:var(--border-strong)_transparent] [scrollbar-width:thin] sm:p-6">
          <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(19rem,0.72fr)]">
            <div className="space-y-4">
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
                  className="mt-4 rounded-[var(--radius-md)] border border-[var(--danger-line)] bg-[var(--danger-soft)] px-4 py-3 text-sm font-medium text-[var(--danger-ink)]"
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
