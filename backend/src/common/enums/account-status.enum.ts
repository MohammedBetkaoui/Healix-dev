export const AccountStatus = {
  BASIC_ACCOUNT: 'BASIC_ACCOUNT',
  PENDING_VERIFICATION: 'PENDING_VERIFICATION',
  VERIFIED_NO_PLAN: 'VERIFIED_NO_PLAN',
  PAYMENT_PENDING: 'PAYMENT_PENDING',
  ACTIVE: 'ACTIVE',
  REJECTED: 'REJECTED',
  SUSPENDED: 'SUSPENDED',
} as const;

export type AccountStatus = (typeof AccountStatus)[keyof typeof AccountStatus];
