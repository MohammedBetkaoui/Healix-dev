import { type Prisma } from '@prisma/client';

import { type PrismaService } from '../prisma/prisma.service';

type PrismaExecutor = PrismaService | Prisma.TransactionClient;

// The plan fields every reader of a subscription needs.
export const subscriptionPlanSelect = {
  accountType: true,
  code: true,
  custom: true,
  id: true,
  name: true,
  quotas: true,
} as const;

// An account holds one current subscription: its latest row. A renewal, a
// plan change or a new purchase after a lapse updates it in place (the history
// is in SubscriptionEvent); older rows only exist from before that rule.
export function findCurrentSubscription(
  client: PrismaExecutor,
  userId: string,
) {
  return client.subscription.findFirst({
    include: { plan: { select: subscriptionPlanSelect } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    where: { userId },
  });
}

// Locks the current subscription row until the transaction ends, so that two
// requests of one account (two AI analyses, a purchase and an analysis...)
// queue up instead of reading the same usage. It must come before any other
// read of the transaction: a plain read first would fix the snapshot that the
// counts that follow are made on (InnoDB REPEATABLE READ).
export async function lockCurrentSubscription(
  client: Prisma.TransactionClient,
  userId: string,
): Promise<void> {
  await client.$queryRaw`SELECT id FROM subscriptions WHERE user_id = ${userId} ORDER BY created_at DESC, id DESC LIMIT 1 FOR UPDATE`;
}
