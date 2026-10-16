import { GUARDS_METADATA } from '@nestjs/common/constants';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { VerifiedAccountGuard } from '../common/guards/verified-account.guard';
import { ConversationsController } from './conversations.controller';

const throttle = (key: string, handler: object) =>
  Reflect.getMetadata(`THROTTLER:${key}default`, handler) as unknown;

describe('ConversationsController', () => {
  it('is for verified professionals only', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, ConversationsController),
    ).toEqual([JwtAuthGuard, RolesGuard, VerifiedAccountGuard]);
    expect(Reflect.getMetadata(ROLES_KEY, ConversationsController)).toEqual([
      'ESTABLISHMENT_ADMIN',
      'INDEPENDENT_DOCTOR',
      'AFFILIATED_DOCTOR',
    ]);
  });

  it('limits the creations to 20 per hour, counted per user (no IP tracker)', () => {
    const create = Object.getOwnPropertyDescriptor(
      ConversationsController.prototype,
      'create',
    )?.value as object;
    expect(throttle('LIMIT', create)).toBe(20);
    expect(throttle('TTL', create)).toBe(3_600_000);
    // Without a tracker of its own, the route uses AppThrottlerGuard's:
    // user:<sub> for a signed-in caller.
    expect(throttle('TRACKER', create)).toBeUndefined();
  });
});
