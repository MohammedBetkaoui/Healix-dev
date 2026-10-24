import { SetMetadata } from '@nestjs/common';

export const REQUIRES_ACTIVE_SUBSCRIPTION_KEY = 'requiresActiveSubscription';

// Marks a clinical write action (creating a patient, an appointment, an AI
// analysis...): SubscriptionGuard refuses it with 403 SUBSCRIPTION_INACTIVE
// when the account's subscription is neither ACTIVE nor TRIALING. Reading,
// downloading, messaging and the account never carry it.
export const RequiresActiveSubscription = () =>
  SetMetadata(REQUIRES_ACTIVE_SUBSCRIPTION_KEY, true);
