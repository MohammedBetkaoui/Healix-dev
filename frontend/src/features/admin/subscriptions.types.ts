import { type PaginationMeta } from "@/types/admin";
import {
  type AccountType,
  type BillingPeriod,
  type PlanQuotas,
  type SubscriptionStatus,
} from "@/types/subscription";

import {
  type EntitlementUsage,
  type SubscriptionEventType,
} from "../subscriptions/types/entitlements.types";

// GET /admin/subscriptions: one paying account per row. Mirrors
// backend/src/admin/subscriptions/admin-subscriptions.service.ts#list.
// `status` is the effective one (an ended subscription reads EXPIRED even
// before the hourly job has marked it); NO_PLAN is a verified account without
// any subscription.
export type AdminSubscriptionRow = {
  accountId: string;
  accountStatus: string;
  accountType: AccountType;
  daysLeft: number | null;
  displayName: string;
  email: string;
  expiresAt: string | null;
  fullName: string;
  lastPayment: {
    amount: number;
    createdAt: string;
    currency: string;
    id: string;
    method: string;
    paidAt: string | null;
    reference: string;
    status: string;
  } | null;
  phone: string;
  plan: { code: string; custom: boolean; id: string; name: string } | null;
  quotas: PlanQuotas;
  status: SubscriptionStatus;
  storedStatus: SubscriptionStatus;
  trial: boolean;
  usage: EntitlementUsage;
};

export type AdminSubscriptionsQuery = {
  accountType?: AccountType;
  expiresWithinDays?: number;
  limit?: number;
  page?: number;
  search?: string;
  status?: SubscriptionStatus;
};

export type AdminSubscriptionsResponse = {
  data: AdminSubscriptionRow[];
  meta: PaginationMeta;
};

type PlanReference = { code: string; name: string } | null;

// GET /admin/subscriptions/:accountId (#getDetail).
export type AdminSubscriptionDetail = {
  account: {
    accountStatus: string;
    accountType: AccountType;
    displayName: string;
    email: string;
    fullName: string;
    id: string;
    phone: string;
    verificationStatus: string;
  };
  entitlements: {
    daysLeft: number | null;
    expiresAt: string | null;
    plan: AdminSubscriptionRow["plan"];
    quotas: PlanQuotas;
    readOnly: boolean;
    status: SubscriptionStatus;
    trial: boolean;
    usage: EntitlementUsage;
  };
  events: {
    actor: { email: string; fullName: string } | null;
    createdAt: string;
    fromExpiresAt: string | null;
    fromPlan: PlanReference;
    fromStatus: SubscriptionStatus | null;
    id: string;
    paymentReference: string | null;
    reason: string | null;
    toExpiresAt: string | null;
    toPlan: PlanReference;
    toStatus: SubscriptionStatus | null;
    type: SubscriptionEventType;
  }[];
  payments: {
    amount: number;
    billingPeriod: BillingPeriod;
    cardLast4: string | null;
    createdAt: string;
    currency: string;
    id: string;
    method: string;
    paidAt: string | null;
    plan: PlanReference;
    reference: string;
    status: string;
  }[];
  subscription: {
    billingPeriod: BillingPeriod;
    canceledAt: string | null;
    customQuotas: PlanQuotas | null;
    expiresAt: string | null;
    id: string;
    plan: { code: string; custom: boolean; id: string; name: string; quotas: PlanQuotas };
    startedAt: string | null;
    status: SubscriptionStatus;
    trial: boolean;
  } | null;
};

// What an action answers (#respond): the subscription after the change.
export type AdminSubscriptionActionResponse = {
  message: string;
  subscription: {
    daysLeft: number | null;
    expiresAt: string | null;
    id: string;
    status: SubscriptionStatus;
    trial: boolean;
  };
};

// The quotas an administrator fixes: a key left out keeps the plan's value,
// null is unlimited (aiPipelines null: every pipeline).
export type AdminQuotasInput = Partial<PlanQuotas>;
