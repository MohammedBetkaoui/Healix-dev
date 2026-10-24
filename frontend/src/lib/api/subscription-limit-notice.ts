// A subscription limit seen by the HTTP client (outside React), shown by
// SubscriptionLimitDialog: one dialog whatever the screen that triggered it.

import { type SubscriptionLimit } from "./subscription-limit";

type SubscriptionLimitListener = (limit: SubscriptionLimit) => void;

const listeners = new Set<SubscriptionLimitListener>();

export function onSubscriptionLimit(listener: SubscriptionLimitListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifySubscriptionLimit(limit: SubscriptionLimit): void {
  listeners.forEach((listener) => listener(limit));
}
