export const BillingPeriod = {
  MONTHLY: 'MONTHLY',
  ANNUAL: 'ANNUAL',
} as const;

export type BillingPeriod =
  (typeof BillingPeriod)[keyof typeof BillingPeriod];
