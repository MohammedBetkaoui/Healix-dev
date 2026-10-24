import { renderToStaticMarkup } from "react-dom/server";

import { dictionaries } from "@/i18n";
import { translate } from "@/lib/i18n";

import { PaymentMethodSelector } from "./PaymentMethodSelector";
import { SubscriptionFAQ } from "./SubscriptionFAQ";

const t = (key: string, params?: Record<string, string | number>) => translate(dictionaries.fr, key, params);
const escaped = (text: string) => text.replaceAll("'", "&#x27;");

const original = process.env.NEXT_PUBLIC_MANUAL_PAYMENTS_ENABLED;

afterEach(() => {
  if (original === undefined) {
    delete process.env.NEXT_PUBLIC_MANUAL_PAYMENTS_ENABLED;
  } else {
    process.env.NEXT_PUBLIC_MANUAL_PAYMENTS_ENABLED = original;
  }
});

describe("PaymentMethodSelector", () => {
  const render = (props: Partial<Parameters<typeof PaymentMethodSelector>[0]> = {}) =>
    renderToStaticMarkup(<PaymentMethodSelector disabled={false} onChange={jest.fn()} t={t} {...props} />);

  it("offers the card alone by default", () => {
    delete process.env.NEXT_PUBLIC_MANUAL_PAYMENTS_ENABLED;
    const html = render();

    expect(html).toContain(escaped(t("subscription.payment.methods.chargily.title")));
    expect(html).not.toContain(escaped(t("subscription.payment.methods.manual.title")));
    expect(html).not.toContain(escaped(t("subscription.payment.methods.cash.title")));
    expect(html).not.toContain(escaped(t("subscription.payment.methods.baridimob.title")));
    expect(html.match(/<button/g)).toHaveLength(1);
  });

  it("offers the offline methods too once the deployment enables them", () => {
    process.env.NEXT_PUBLIC_MANUAL_PAYMENTS_ENABLED = "true";
    const html = render();

    expect(html.match(/<button/g)).toHaveLength(4);
    expect(html).toContain(escaped(t("subscription.payment.methods.manual.title")));
    expect(html).toContain(escaped(t("subscription.payment.methods.cash.title")));
    expect(html).toContain(escaped(t("subscription.payment.methods.baridimob.title")));
  });

  it("shows exactly the methods it is given", () => {
    const html = render({ availableMethods: ["SYNTHETIC_CHARGILY", "MANUAL_CASH"], selectedMethod: "MANUAL_CASH" });

    expect(html.match(/<button/g)).toHaveLength(2);
    expect(html).toContain('aria-pressed="true"');
  });
});

describe("SubscriptionFAQ", () => {
  it("does not promise a manual payment when it is off", () => {
    delete process.env.NEXT_PUBLIC_MANUAL_PAYMENTS_ENABLED;
    const html = renderToStaticMarkup(<SubscriptionFAQ t={t} />);

    expect(html).toContain(escaped(t("subscription.faq.items.activation.question")));
    expect(html).not.toContain(escaped(t("subscription.faq.items.manual.question")));
    // The answer on activation says it is immediate, with no administrator.
    expect(html).toContain("activé immédiatement");
  });

  it("answers the question on manual payment when it is on", () => {
    process.env.NEXT_PUBLIC_MANUAL_PAYMENTS_ENABLED = "true";

    expect(renderToStaticMarkup(<SubscriptionFAQ t={t} />)).toContain(escaped(t("subscription.faq.items.manual.question")));
  });
});
