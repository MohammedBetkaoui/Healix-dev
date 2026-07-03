export type AccountType = "ESTABLISHMENT" | "INDEPENDENT_DOCTOR";

export type AccountStatus =
  | "BASIC_ACCOUNT"
  | "PENDING_VERIFICATION"
  | "VERIFIED_NO_PLAN"
  | "ACTIVE"
  | "REJECTED"
  | "SUSPENDED";

export type VerificationStatus =
  | "NOT_STARTED"
  | "PENDING_VERIFICATION"
  | "VERIFIED"
  | "REJECTED"
  | "SUSPENDED";

export type SubscriptionStatus =
  | "NO_PLAN"
  | "PAYMENT_PENDING"
  | "ACTIVE"
  | "EXPIRED"
  | "CANCELED";

export type BillingPeriod = "MONTHLY" | "ANNUAL";

export type PaymentMethod =
  | "SYNTHETIC_CHARGILY"
  | "MANUAL_CASH"
  | "MANUAL_POST_TRANSFER"
  | "BARIDIMOB_RECEIPT";

export type SubscriptionPlan = {
  accountType: AccountType;
  annualPrice: number | null;
  badge?: string;
  currency: "DZD";
  custom?: boolean;
  description: string;
  features: string[];
  id: string;
  limits: string[];
  monthlyPrice: number | null;
  name: string;
  recommended?: boolean;
};

export type SubscriptionPageState = {
  billingPeriod: BillingPeriod;
  paymentMethod?: PaymentMethod;
  selectedPlanId?: string;
};

export type SubscriptionContext = {
  accountStatus: AccountStatus;
  accountType: AccountType;
  currentPlanId: string | null;
  currentPeriodEnd?: string;
  currentPeriodStart?: string;
  subscriptionStatus: SubscriptionStatus;
  verificationStatus: VerificationStatus;
};
