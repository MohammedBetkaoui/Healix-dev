import { ChevronDown, HelpCircle } from "lucide-react";

import { type TranslationFunction } from "@/lib/i18n";

type SubscriptionFAQProps = {
  t: TranslationFunction;
};

const faqItems = [
  "activation",
  "annual",
  "changePlan",
  "verification",
  "cardData",
  "manual",
] as const;

export function SubscriptionFAQ({ t }: SubscriptionFAQProps) {
  return (
    <section className="rounded-[1.2rem] border border-[var(--line)] bg-[var(--panel)] p-5 shadow-[0_16px_38px_-30px_rgba(22,33,29,0.48)]">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-[0.78rem] rounded-bl-[0.25rem] border border-[var(--accent-line)] bg-[var(--accent-soft)] text-[var(--accent-dark)]">
          <HelpCircle className="h-5 w-5" strokeWidth={1.7} aria-hidden="true" />
        </span>
        <div>
          <h2 className="font-[var(--font-auth-display)] text-[1.65rem] font-medium text-[var(--ink)]">
            {t("subscription.faq.title")}
          </h2>
          <p className="mt-1 text-sm text-[var(--ink-soft)]">
            {t("subscription.faq.subtitle")}
          </p>
        </div>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {faqItems.map((item) => (
          <details
            key={item}
            className="group self-start rounded-[1rem] border border-[var(--line)] bg-[var(--panel)] open:shadow-[0_14px_30px_-26px_rgba(22,33,29,0.7)]"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-4 text-sm font-medium text-[var(--ink)] transition hover:bg-[var(--panel-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)] [&::-webkit-details-marker]:hidden">
              {t(`subscription.faq.items.${item}.question`)}
              <ChevronDown
                className="h-4 w-4 shrink-0 text-[var(--accent)] transition-transform duration-200 group-open:rotate-180"
                strokeWidth={1.7}
                aria-hidden="true"
              />
            </summary>
            <p className="border-t border-[var(--line-soft)] px-4 py-4 text-sm leading-6 text-[var(--ink-soft)]">
              {t(`subscription.faq.items.${item}.answer`)}
            </p>
          </details>
        ))}
      </div>
    </section>
  );
}
