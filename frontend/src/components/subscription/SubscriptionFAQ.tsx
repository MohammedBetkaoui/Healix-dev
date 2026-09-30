import { ChevronDown } from "lucide-react";

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
    <section
      aria-labelledby="subscription-faq-heading"
      className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)]"
    >
      <div className="clinical-section-heading border-b border-[var(--line-soft)]">
        <div>
          <h2 id="subscription-faq-heading" className="text-[var(--text-primary)]">
            {t("subscription.faq.title")}
          </h2>
          <p className="clinical-caption mt-0.5">{t("subscription.faq.subtitle")}</p>
        </div>
      </div>
      <div className="divide-y divide-[var(--line-soft)]">
        {faqItems.map((item) => (
          <details key={item} className="group">
            <summary className="flex min-h-[52px] cursor-pointer list-none items-center justify-between gap-4 px-5 py-3 text-sm font-medium text-[var(--text-primary)] transition hover:bg-[var(--surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)] [&::-webkit-details-marker]:hidden">
              {t(`subscription.faq.items.${item}.question`)}
              <ChevronDown
                className="h-4 w-4 shrink-0 text-[var(--text-secondary)] transition-transform duration-200 group-open:rotate-180"
                strokeWidth={1.8}
                aria-hidden="true"
              />
            </summary>
            <p className="max-w-3xl px-5 pb-4 text-sm leading-6 text-[var(--text-secondary)]">
              {t(`subscription.faq.items.${item}.answer`)}
            </p>
          </details>
        ))}
      </div>
    </section>
  );
}
