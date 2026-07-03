import { type AccountType, type SubscriptionContext } from "@/types/subscription";

export const mockDoctorSubscriptionContext: SubscriptionContext = {
  accountStatus: "VERIFIED_NO_PLAN",
  accountType: "INDEPENDENT_DOCTOR",
  currentPlanId: null,
  subscriptionStatus: "NO_PLAN",
  verificationStatus: "VERIFIED",
};

export const mockEstablishmentSubscriptionContext: SubscriptionContext = {
  accountStatus: "VERIFIED_NO_PLAN",
  accountType: "ESTABLISHMENT",
  currentPlanId: null,
  subscriptionStatus: "NO_PLAN",
  verificationStatus: "VERIFIED",
};

export const mockSubscriptionContexts: Record<
  string,
  SubscriptionContext
> = {
  activeDoctor: {
    accountStatus: "ACTIVE",
    accountType: "INDEPENDENT_DOCTOR",
    currentPeriodEnd: "2027-07-03",
    currentPeriodStart: "2026-07-03",
    currentPlanId: "doctor-pro",
    subscriptionStatus: "ACTIVE",
    verificationStatus: "VERIFIED",
  },
  pendingEstablishment: {
    accountStatus: "PENDING_VERIFICATION",
    accountType: "ESTABLISHMENT",
    currentPlanId: null,
    subscriptionStatus: "NO_PLAN",
    verificationStatus: "PENDING_VERIFICATION",
  },
  rejectedDoctor: {
    accountStatus: "BASIC_ACCOUNT",
    accountType: "INDEPENDENT_DOCTOR",
    currentPlanId: null,
    subscriptionStatus: "NO_PLAN",
    verificationStatus: "REJECTED",
  },
  suspendedEstablishment: {
    accountStatus: "SUSPENDED",
    accountType: "ESTABLISHMENT",
    currentPlanId: null,
    subscriptionStatus: "NO_PLAN",
    verificationStatus: "SUSPENDED",
  },
  unverifiedDoctor: {
    accountStatus: "BASIC_ACCOUNT",
    accountType: "INDEPENDENT_DOCTOR",
    currentPlanId: null,
    subscriptionStatus: "NO_PLAN",
    verificationStatus: "NOT_STARTED",
  },
};

export function getMockSubscriptionContext(accountType: AccountType) {
  return accountType === "ESTABLISHMENT"
    ? mockEstablishmentSubscriptionContext
    : mockDoctorSubscriptionContext;
}
