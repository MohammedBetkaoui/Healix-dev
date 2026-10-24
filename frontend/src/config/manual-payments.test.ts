import { availablePaymentMethods, manualPaymentsEnabled, onlinePaymentMethod } from "./manual-payments";

const original = process.env.NEXT_PUBLIC_MANUAL_PAYMENTS_ENABLED;

afterEach(() => {
  if (original === undefined) {
    delete process.env.NEXT_PUBLIC_MANUAL_PAYMENTS_ENABLED;
  } else {
    process.env.NEXT_PUBLIC_MANUAL_PAYMENTS_ENABLED = original;
  }
});

describe("manual payment methods", () => {
  it("are hidden by default: the card is the only way to subscribe", () => {
    delete process.env.NEXT_PUBLIC_MANUAL_PAYMENTS_ENABLED;

    expect(manualPaymentsEnabled()).toBe(false);
    expect(availablePaymentMethods()).toEqual([onlinePaymentMethod]);
  });

  it.each(["false", "", "1", "TRUE", "yes"])("stay hidden for NEXT_PUBLIC_MANUAL_PAYMENTS_ENABLED=%j: only the literal true enables them", (value) => {
    process.env.NEXT_PUBLIC_MANUAL_PAYMENTS_ENABLED = value;

    expect(manualPaymentsEnabled()).toBe(false);
    expect(availablePaymentMethods()).toEqual(["SYNTHETIC_CHARGILY"]);
  });

  it("are offered, after the card, once NEXT_PUBLIC_MANUAL_PAYMENTS_ENABLED=true", () => {
    process.env.NEXT_PUBLIC_MANUAL_PAYMENTS_ENABLED = "true";

    expect(manualPaymentsEnabled()).toBe(true);
    expect(availablePaymentMethods()).toEqual(["SYNTHETIC_CHARGILY", "MANUAL_POST_TRANSFER", "MANUAL_CASH", "BARIDIMOB_RECEIPT"]);
  });
});
