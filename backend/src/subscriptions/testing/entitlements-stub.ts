import { type Prisma } from '@prisma/client';

import { type EntitlementsService } from '../entitlements.service';

// For the specs that are not about quotas: an EntitlementsService whose gate
// lets everything through and hands `run` the spec's own database double.
// Specs only.
export function passThroughEntitlements(
  client: unknown = {},
): EntitlementsService {
  return {
    withQuota: <T>(
      _workspaceId: string,
      _quota: string,
      run: (client: Prisma.TransactionClient) => Promise<T>,
    ) => run(client as Prisma.TransactionClient),
  } as unknown as EntitlementsService;
}
