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

// What paying would do to the subscription, computed by the backend before the
// card form (GET /payments/:id, while the payment is open): the new end, and
// whether it ends the trial or changes the plan.
export type PaymentExpiryPreview = {
  currentExpiresAt: string | null;
  endsTrial: boolean;
  expiresAt: string;
  type: "PLAN_CHANGED" | "PURCHASED" | "RENEWED";
};

// The subscription a successful card payment activated.
export type ActivatedSubscription = {
  expiresAt: string | null;
  id: string;
  startedAt: string | null;
  status: string;
  trial: boolean;
};

export type PaymentSummary = {
  accountType: AccountType;
  amount: number;
  billingPeriod: BillingPeriod;
  cardHolderName?: string | null;
  cardLast4?: string | null;
  createdAt: string;
  currency: "DZD";
  expiryPreview?: PaymentExpiryPreview | null;
  id: string;
  method: PaymentMethod;
  paidAt?: string | null;
  plan?: PaymentPlanSummary;
  proof?: PaymentProofSummary;
  reference: string;
  rejectionReason?: string | null;
  status: PaymentStatus;
  subscription?: { expiresAt: string | null; id: string; status: string } | null;
  updatedAt: string;
};

export type UploadPaymentProofResponse = {
  message: string;
  paymentStatus: PaymentStatus;
  proof: NonNullable<PaymentProofSummary>;
};
