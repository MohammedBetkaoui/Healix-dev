export const PaymentMethod = {
  SYNTHETIC_CHARGILY: 'SYNTHETIC_CHARGILY',
  MANUAL_CASH: 'MANUAL_CASH',
  MANUAL_POST_TRANSFER: 'MANUAL_POST_TRANSFER',
  BARIDIMOB_RECEIPT: 'BARIDIMOB_RECEIPT',
} as const;

export type PaymentMethod =
  (typeof PaymentMethod)[keyof typeof PaymentMethod];
