export const PaymentStatus = {
  CREATED: 'CREATED',
  WAITING_PAYMENT: 'WAITING_PAYMENT',
  WAITING_ADMIN_REVIEW: 'WAITING_ADMIN_REVIEW',
  PAID: 'PAID',
  REJECTED: 'REJECTED',
  FAILED: 'FAILED',
  CANCELED: 'CANCELED',
  EXPIRED: 'EXPIRED',
} as const;

export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];
