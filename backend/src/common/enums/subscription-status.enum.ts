export const SubscriptionStatus = {
  NO_PLAN: 'NO_PLAN',
  PAYMENT_PENDING: 'PAYMENT_PENDING',
  ACTIVE: 'ACTIVE',
  EXPIRED: 'EXPIRED',
  CANCELED: 'CANCELED',
} as const;

export type SubscriptionStatus =
  (typeof SubscriptionStatus)[keyof typeof SubscriptionStatus];
