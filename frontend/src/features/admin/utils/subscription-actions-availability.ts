import { type AdminSubscriptionDetail } from "../subscriptions.types";
import { type AdminActionKind } from "./subscription-actions";

// The actions of the console that apply to an account in the state it is in
// (the backend refuses the others with 409):
//  - extend the trial: a trial, running or just ended, not one that was stopped;
//  - a commercial gesture: any subscription that was not stopped;
//  - stop the account: a live subscription (ACTIVE or TRIALING);
//  - custom quotas: any subscription;
//  - activate a contract on quote: an establishment.
export function availableAdminActions(detail: AdminSubscriptionDetail): AdminActionKind[] {
  const subscription = detail.subscription;
  const actions: AdminActionKind[] = [];

  if (subscription) {
    if (subscription.trial && subscription.status !== "CANCELED") actions.push("extendTrial");
    if (subscription.status !== "CANCELED") actions.push("extend");
    if (subscription.status === "ACTIVE" || subscription.status === "TRIALING") actions.push("cancel");
    actions.push("quotas");
  }

  if (detail.account.accountType === "ESTABLISHMENT") actions.push("activateCustom");

  return actions;
}
