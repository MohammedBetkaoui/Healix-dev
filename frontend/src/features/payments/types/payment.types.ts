import {
  type AccountType,
  type BillingPeriod,
  type PaymentMethod,
} from "@/types/subscription";

export type PaymentProofType = "POST_TRANSFER_PROOF" | "BARIDIMOB_RECEIPT";

export type PaymentStatus =
  | "CREATED"
  | "WAITING_PAYMENT"
  | "WAITING_ADMIN_REVIEW"
  | "PAID"
  | "REJECTED"
  | "FAILED"
  | "CANCELED"
  | "EXPIRED";

export type CreatePaymentIntentPayload = {
  billingPeriod: BillingPeriod;
  paymentMethod: PaymentMethod;
  planId: string;
};

export type CreatePaymentIntentResponse = {
  amount: number;
  ccp: string | null;
  currency: "DZD";
  method: PaymentMethod;
  nextAction: string;
  paymentId: string;
  redirectTo: string;
  reference: string;
};

export type SyntheticChargilyPayload = {
  cardHolderName: string;
  cardNumber: string;
  expiryMonth: string;
  expiryYear: string;
  psv: string;
};

export type PaymentPlanSummary = {
  code: string;
  currency: string;
  id: string;
  name: string;
};

export type PaymentProofSummary = {
  documentType: string;
  id: string;
  mimeType: string;
  originalName: string;
  size: number;
  uploadedAt: string;
} | null;

export type PaymentSummary = {
  accountType: AccountType;
  amount: number;
  billingPeriod: BillingPeriod;
  cardHolderName?: string | null;
  cardLast4?: string | null;
  createdAt: string;
  currency: "DZD";
  id: string;
  method: PaymentMethod;
  paidAt?: string | null;
  plan?: PaymentPlanSummary;
  proof?: PaymentProofSummary;
  reference: string;
  rejectionReason?: string | null;
  status: PaymentStatus;
  updatedAt: string;
};

export type UploadPaymentProofResponse = {
  message: string;
  paymentStatus: PaymentStatus;
  proof: NonNullable<PaymentProofSummary>;
};
