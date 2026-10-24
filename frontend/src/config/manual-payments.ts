import { type PaymentMethod } from "@/types/subscription";

// The normal way to subscribe is the online card payment, which activates the
// subscription at once. The offline settlements (cash, postal transfer,
// BaridiMob receipt) are off, and no longer offered, unless the deployment
// sets NEXT_PUBLIC_MANUAL_PAYMENTS_ENABLED=true (the backend refuses them as
// well unless MANUAL_PAYMENTS_ENABLED=true). Like every NEXT_PUBLIC_ value it
// is written into the build: only the literal process.env access is inlined.
export function manualPaymentsEnabled(): boolean {
  return process.env.NEXT_PUBLIC_MANUAL_PAYMENTS_ENABLED === "true";
}

export const onlinePaymentMethod: PaymentMethod = "SYNTHETIC_CHARGILY";

export const manualPaymentMethods: PaymentMethod[] = [
  "MANUAL_POST_TRANSFER",
  "MANUAL_CASH",
  "BARIDIMOB_RECEIPT",
];

/** The methods offered to the user: the card alone unless offline settlements are enabled. */
export function availablePaymentMethods(manualEnabled = manualPaymentsEnabled()): PaymentMethod[] {
  return manualEnabled ? [onlinePaymentMethod, ...manualPaymentMethods] : [onlinePaymentMethod];
}
