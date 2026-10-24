import { CheckCircle2, ShieldAlert, XCircle } from "lucide-react";
import Link from "next/link";

import { formatBillingDate } from "@/components/subscription/subscription-format";
import { type Locale } from "@/i18n";
import { type TranslationFunction } from "@/lib/i18n";
import { type AccountType } from "@/types/subscription";

const primaryLink =
  "inline-flex h-11 items-center justify-center rounded-full bg-[#0b3b5f] px-5 text-sm font-medium text-white shadow-sm shadow-sky-950/15 transition hover:bg-[#092f4d]";
const secondaryLink =
  "inline-flex h-11 items-center justify-center rounded-full border border-slate-300 bg-white px-5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-100";

export function roleBase(accountType: AccountType | undefined): string {
  return accountType === "ESTABLISHMENT" ? "/establishment" : "/doctor";
}

// The banner of the demo page, at the top, before anything is typed.
export function DemoPaymentBanner({ t }: { t: TranslationFunction }) {
  return (
    <div
      role="note"
      className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950"
    >
      <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
      <div>
        <p className="font-semibold">{t("subscription.payNow.demoBanner")}</p>
        <p className="mt-0.5 text-sm">{t("subscription.payNow.demoBannerHint")}</p>
      </div>
    </div>
  );
}

// The subscription is active as soon as the card is accepted: no
// administrator validates anything.
export function PaymentSuccessPanel({
  accountType,
  expiresAt,
  locale,
  t,
}: {
  accountType: AccountType | undefined;
  expiresAt: string | null | undefined;
  locale: Locale;
  t: TranslationFunction;
}) {
  const date = formatBillingDate(expiresAt ?? undefined, locale);

  return (
    <section
      role="status"
      data-outcome="paid"
      className="rounded-[24px] border border-emerald-200 bg-emerald-50 p-6 text-emerald-950"
    >
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-700" aria-hidden="true" />
        <div>
          <h2 className="text-lg font-semibold">{t("subscription.payNow.success.title")}</h2>
          <p className="mt-1 text-sm leading-6">{t("subscription.payNow.success.text")}</p>
          {date ? (
            <p className="mt-2 font-semibold">
              {t("subscription.payNow.success.expiresOn", { date })}
            </p>
          ) : null}
        </div>
      </div>
      <div className="mt-5 flex flex-wrap gap-3">
        <Link className={primaryLink} href={`${roleBase(accountType)}/dashboard`}>
          {t("subscription.payNow.success.dashboard")}
        </Link>
        <Link className={secondaryLink} href={`${roleBase(accountType)}/subscription`}>
          {t("subscription.payNow.success.subscription")}
        </Link>
      </div>
    </section>
  );
}

// A declined card: nothing debited, subscription unchanged. The payment is
// final, so another try is a new payment for the same plan.
export function PaymentDeclinedPanel({
  error,
  isRetrying,
  onRetry,
  t,
}: {
  error?: string | null;
  isRetrying: boolean;
  onRetry: () => void;
  t: TranslationFunction;
}) {
  return (
    <section
      role="alert"
      data-outcome="declined"
      className="rounded-[24px] border border-rose-200 bg-rose-50 p-6 text-rose-950"
    >
      <div className="flex items-start gap-3">
        <XCircle className="mt-0.5 h-6 w-6 shrink-0 text-rose-700" aria-hidden="true" />
        <div>
          <h2 className="text-lg font-semibold">{t("subscription.payNow.failed.title")}</h2>
          <p className="mt-1 text-sm leading-6">{t("subscription.payNow.failed.text")}</p>
          {error ? <p className="mt-2 text-sm font-medium">{error}</p> : null}
        </div>
      </div>
      <button
        type="button"
        className={`${primaryLink} mt-5 disabled:opacity-60`}
        disabled={isRetrying}
        onClick={onRetry}
      >
        {isRetrying
          ? t("subscription.payNow.failed.retrying")
          : t("subscription.payNow.failed.retry")}
      </button>
    </section>
  );
}
