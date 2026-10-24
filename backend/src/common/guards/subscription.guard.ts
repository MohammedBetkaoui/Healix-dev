import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { type AuthenticatedRequest } from '../../auth/types/authenticated-request.type';
import { subscriptionInactive } from '../../subscriptions/subscription-errors';
import { EntitlementsService } from '../../subscriptions/entitlements.service';
import { REQUIRES_ACTIVE_SUBSCRIPTION_KEY } from '../decorators/requires-active-subscription.decorator';

// The write actions marked @RequiresActiveSubscription() need a live
// subscription (ACTIVE or TRIALING, not past its end) on the workspace of the
// caller: the one of the doctor's private practice, the one of the
// establishment for its owner and its affiliated doctors. Every other route
// passes: an account without a subscription keeps reading, downloading and
// exporting what it has. Must run after JwtAuthGuard and VerifiedAccountGuard.
@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly entitlements: EntitlementsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<boolean | undefined>(
      REQUIRES_ACTIVE_SUBSCRIPTION_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!required) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!user) {
      throw new UnauthorizedException();
    }

    const entitlements = await this.entitlements.getEntitlementsForUser(user);

    if (entitlements.readOnly) {
      throw subscriptionInactive(entitlements.status, entitlements.expiresAt);
    }

    return true;
  }
}
