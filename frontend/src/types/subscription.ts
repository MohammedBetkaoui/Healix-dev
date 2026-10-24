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
  | "TRIALING"
  | "ACTIVE"
  | "EXPIRED"
  | "CANCELED";

export type BillingPeriod = "MONTHLY" | "ANNUAL";

export type PaymentMethod =
  | "SYNTHETIC_CHARGILY"
  | "MANUAL_CASH"
  | "MANUAL_POST_TRANSFER"
  | "BARIDIMOB_RECEIPT";

// What a plan allows, in numbers (GET /subscription/plans, field quotas):
// null is unlimited, and aiPipelines null is every pipeline.
export type PlanQuotas = {
  aiAnalysesPerMonth: number | null;
  aiPipelines: string[] | null;
  maxDoctors: number | null;
  maxPatients: number | null;
};

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
  quotas?: PlanQuotas;
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
  // The free trial: its plan is the reference plan, not a bought one.
  currentTrial?: boolean;
  subscriptionStatus: SubscriptionStatus;
  verificationStatus: VerificationStatus;
};
