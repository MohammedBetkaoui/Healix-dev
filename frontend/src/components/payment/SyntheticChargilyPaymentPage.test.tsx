import { renderToStaticMarkup } from "react-dom/server";

import { usePaymentStatus } from "@/features/payments/hooks/use-payment-status";
import { useSyntheticCardPayment } from "@/features/payments/hooks/use-synthetic-card-payment";
import { type PaymentSummary } from "@/features/payments/types/payment.types";
import { dictionaries } from "@/i18n";
import { translate } from "@/lib/i18n";

import { SyntheticChargilyPaymentPage } from "./SyntheticChargilyPaymentPage";

// The page renders here without a session, a router or the API: the data
// hooks answer what each test says.
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams("paymentId=pay-1"),
}));
jest.mock("@/features/payments/hooks/use-payment-status", () => ({ usePaymentStatus: jest.fn() }));
jest.mock("@/features/payments/hooks/use-synthetic-card-payment", () => ({ useSyntheticCardPayment: jest.fn() }));
jest.mock("@/features/payments/hooks/use-create-payment-intent", () => ({
  useCreatePaymentIntent: () => ({ createIntent: jest.fn(), error: null, isLoading: false }),
}));

const fr = (key: string, params?: Record<string, string | number>) => translate(dictionaries.fr, key, params);
// What React writes for an apostrophe in the markup.
const escaped = (text: string) => text.replaceAll("'", "&#x27;");

const payment = (overrides: Partial<PaymentSummary> = {}): PaymentSummary => ({
  accountType: "INDEPENDENT_DOCTOR",
  amount: 5900,
  billingPeriod: "MONTHLY",
  createdAt: "2026-10-24T01:00:00.000Z",
  currency: "DZD",
  expiryPreview: { currentExpiresAt: "2026-11-02T12:00:00.000Z", endsTrial: false, expiresAt: "2026-12-02T12:00:00.000Z", type: "RENEWED" },
  id: "pay-1",
  method: "SYNTHETIC_CHARGILY",
  plan: { code: "DOCTOR_PRO", currency: "DZD", id: "plan-pro", name: "Pro" },
  reference: "HLX-PAY-2026-000007",
  status: "CREATED",
  updatedAt: "2026-10-24T01:00:00.000Z",
  ...overrides,
});

const card = (overrides: object = {}) => ({ declined: false, error: null, isLoading: false, paid: null, submit: jest.fn(), ...overrides });
const render = (data: PaymentSummary | null, cardState = card()) => {
  (usePaymentStatus as jest.Mock).mockReturnValue({ data, error: null, isLoading: false });
  (useSyntheticCardPayment as jest.Mock).mockReturnValue(cardState);
  return renderToStaticMarkup(<SyntheticChargilyPaymentPage />);
};

describe("the card payment page (demonstration)", () => {
  it("says at the top, before anything is typed, that nothing is really charged", () => {
    const html = render(payment());

    expect(html).toContain("Paiement de démonstration — aucun débit réel");
    expect(html).toContain('role="note"');
  });

  it("recaps the plan, the period and the amount in DZD, and the new expiry before paying", () => {
    const html = render(payment());

    expect(html).toContain(fr("subscription.payNow.recap"));
    expect(html).toContain(">Pro<");
    expect(html).toContain(fr("subscription.billing.monthly"));
    expect(html).toContain("5 900 DZD");
    expect(html).toContain(fr("subscription.payNow.newExpiry"));
    expect(html).toContain("Votre abonnement sera prolongé jusqu&#x27;au 2 décembre 2026.");
  });

  it.each([
    ["a first purchase", { endsTrial: false, type: "PURCHASED" as const }, "Votre abonnement sera actif jusqu'au 2 décembre 2026."],
    ["a plan change", { endsTrial: false, type: "PLAN_CHANGED" as const }, "Le nouveau plan s'applique immédiatement. Votre abonnement sera actif jusqu'au 2 décembre 2026."],
    ["a purchase during the trial", { endsTrial: true, type: "PURCHASED" as const }, "Votre essai prend fin et ses jours restants sont conservés : abonnement actif jusqu'au 2 décembre 2026."],
  ])("explains %s", (_case, preview, sentence) => {
    const html = render(payment({ expiryPreview: { currentExpiresAt: null, expiresAt: "2026-12-02T12:00:00.000Z", ...preview } }));

    expect(html).toContain(escaped(sentence));
  });

  it("shows the test card that is accepted, and that any other card is refused", () => {
    const html = render(payment());

    expect(html).toContain(fr("subscription.paymentFlow.testCardNumber"));
    expect(html).toContain(fr("subscription.paymentFlow.testCardHolder"));
    expect(html).toContain(fr("subscription.payNow.accepted"));
    expect(html).toContain(escaped(fr("subscription.payNow.declined")));
    expect(html).toContain(fr("subscription.paymentFlow.pay"));
  });

  it("shows the confirmation as soon as the card is accepted: active at once, with the expiry", () => {
    const html = render(payment(), card({ paid: { expiresAt: "2026-12-02T12:00:00.000Z", id: "sub-1", startedAt: null, status: "ACTIVE", trial: false } }));

    expect(html).toContain('data-outcome="paid"');
    expect(html).toContain(fr("subscription.payNow.success.title"));
    expect(html).toContain("Actif jusqu&#x27;au 2 décembre 2026");
    expect(html).toContain('href="/doctor/dashboard"');
    expect(html).toContain(fr("subscription.payNow.success.dashboard"));
    // The card form is gone.
    expect(html).not.toContain('id="cardNumber"');
  });

  it("goes back to the establishment's dashboard for an establishment", () => {
    const html = render(payment({ accountType: "ESTABLISHMENT" }), card({ paid: { expiresAt: "2026-12-02T12:00:00.000Z", id: "sub-1", startedAt: null, status: "ACTIVE", trial: false } }));

    expect(html).toContain('href="/establishment/dashboard"');
  });

  it("shows the confirmation for a payment already PAID (a reloaded page)", () => {
    const html = render(payment({ expiryPreview: null, status: "PAID", subscription: { expiresAt: "2026-12-02T12:00:00.000Z", id: "sub-1", status: "ACTIVE" } }));

    expect(html).toContain('data-outcome="paid"');
    expect(html).toContain("Actif jusqu&#x27;au 2 décembre 2026");
  });

  it("explains a refused card clearly and lets the user try again", () => {
    const html = render(payment({ status: "FAILED" }), card({ declined: true }));

    expect(html).toContain('data-outcome="declined"');
    expect(html).toContain(fr("subscription.payNow.failed.title"));
    expect(html).toContain(escaped(fr("subscription.payNow.failed.text")));
    expect(html).toContain(fr("subscription.payNow.failed.retry"));
    expect(html).not.toContain('id="cardNumber"');
  });

  it("offers another attempt for a payment that is FAILED on the server too (a reloaded page)", () => {
    expect(render(payment({ status: "FAILED" }))).toContain('data-outcome="declined"');
  });

  it("keeps the form, with the error, for any other failure", () => {
    const html = render(payment(), card({ error: "Impossible de contacter le serveur." }));

    expect(html).toContain('id="cardNumber"');
    expect(html).toContain("Impossible de contacter le serveur.");
    expect(html).not.toContain('data-outcome="declined"');
  });
});
