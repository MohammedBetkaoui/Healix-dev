import { HelpCircle } from "lucide-react";

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
    <section className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-[0_12px_36px_rgba(15,23,42,0.04)]">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-50 text-slate-700">
          <HelpCircle className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-xl font-semibold text-slate-950">
            {t("subscription.faq.title")}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {t("subscription.faq.subtitle")}
          </p>
        </div>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {faqItems.map((item) => (
          <article key={item} className="rounded-2xl bg-slate-50 p-4">
            <h3 className="font-semibold text-slate-950">
              {t(`subscription.faq.items.${item}.question`)}
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {t(`subscription.faq.items.${item}.answer`)}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
