/* eslint-disable @typescript-eslint/unbound-method */
import {
  type ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { type Entitlements } from '../../subscriptions/entitlements';
import { type EntitlementsService } from '../../subscriptions/entitlements.service';
import { RequiresActiveSubscription } from '../decorators/requires-active-subscription.decorator';
import { UserRole } from '../enums/user-role.enum';
import { SubscriptionGuard } from './subscription.guard';

class Controller {
  @RequiresActiveSubscription()
  write() {
    return 'written';
  }

  read() {
    return 'read';
  }
}

@RequiresActiveSubscription()
class WritesOnly {
  anything() {
    return 'anything';
  }
}

const user = {
  email: 'doctor@healix.test',
  role: UserRole.INDEPENDENT_DOCTOR,
  sub: 'doctor-1',
  tokenType: 'access' as const,
};

const contextOf = (
  handler: () => unknown,
  controller: new () => unknown,
  request: Record<string, unknown> = { user },
) =>
  ({
    getClass: () => controller,
    getHandler: () => handler,
    switchToHttp: () => ({ getRequest: () => request }),
  }) as unknown as ExecutionContext;

const entitlements = (overrides: Partial<Entitlements> = {}): Entitlements => ({
  daysLeft: 10,
  expiresAt: new Date('2026-11-01T00:00:00.000Z'),
  plan: { code: 'DOCTOR_PRO', custom: false, id: 'p', name: 'Pro' },
  quotas: {
    aiAnalysesPerMonth: 100,
    aiPipelines: null,
    maxDoctors: 1,
    maxPatients: null,
  },
  readOnly: false,
  status: 'ACTIVE',
  trial: false,
  usage: { aiAnalysesThisMonth: 0, doctors: 1, patients: 0 },
  ...overrides,
});

function setup(resolved: Entitlements) {
  const getEntitlementsForUser = jest.fn().mockResolvedValue(resolved);
  const guard = new SubscriptionGuard(new Reflector(), {
    getEntitlementsForUser,
  } as unknown as EntitlementsService);
  return { getEntitlementsForUser, guard };
}

describe('SubscriptionGuard', () => {
  it('lets a write through while the subscription is live (a trial counts)', async () => {
    const { getEntitlementsForUser, guard } = setup(
      entitlements({ status: 'TRIALING', trial: true }),
    );

    await expect(
      guard.canActivate(contextOf(Controller.prototype.write, Controller)),
    ).resolves.toBe(true);
    expect(getEntitlementsForUser).toHaveBeenCalledWith(user);
  });

  it('refuses a write with 403 SUBSCRIPTION_INACTIVE, the status and the expiry', async () => {
    const expiresAt = new Date('2026-10-01T00:00:00.000Z');
    const { guard } = setup(
      entitlements({ expiresAt, readOnly: true, status: 'EXPIRED' }),
    );

    const error: unknown = await guard
      .canActivate(contextOf(Controller.prototype.write, Controller))
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ForbiddenException);
    expect((error as ForbiddenException).getStatus()).toBe(403);
    expect((error as ForbiddenException).getResponse()).toMatchObject({
      code: 'SUBSCRIPTION_INACTIVE',
      expiresAt,
      status: 'EXPIRED',
    });
  });

  it('never blocks a route that is not a write: reading stays open without a subscription', async () => {
    const { getEntitlementsForUser, guard } = setup(
      entitlements({ readOnly: true, status: 'EXPIRED' }),
    );

    await expect(
      guard.canActivate(contextOf(Controller.prototype.read, Controller)),
    ).resolves.toBe(true);
    expect(getEntitlementsForUser).not.toHaveBeenCalled();
  });

  it('honours the decorator placed on the whole controller', async () => {
    const { guard } = setup(
      entitlements({ readOnly: true, status: 'CANCELED' }),
    );

    await expect(
      guard.canActivate(contextOf(WritesOnly.prototype.anything, WritesOnly)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses a request that has no user', async () => {
    const { guard } = setup(entitlements());

    await expect(
      guard.canActivate(contextOf(Controller.prototype.write, Controller, {})),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
