import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import { AdminJwtGuard } from '../../admin-auth/guards/admin-jwt.guard';
import { type AdminAuthenticatedRequest } from '../../admin-auth/types/admin-authenticated-request.type';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { ThrottlePerIp } from '../../common/guards/app-throttler.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { getRequestContext } from '../../common/utils/request-context';
import { AdminSubscriptionsService } from './admin-subscriptions.service';
import { ActivateCustomSubscriptionDto } from './dto/activate-custom-subscription.dto';
import {
  ExtendSubscriptionDto,
  ExtendTrialDto,
} from './dto/extend-subscription.dto';
import { ListSubscriptionsQueryDto } from './dto/list-subscriptions-query.dto';
import { SubscriptionReasonDto } from './dto/subscription-reason.dto';
import { UpdateSubscriptionQuotasDto } from './dto/update-subscription-quotas.dto';

// The console for the special cases (a trial to extend, a commercial gesture,
// an account to stop, custom quotas, a contract on quote). Same access as
// admin payments. A normal purchase never goes through here: the card payment
// activates it by itself. `accountId` is the id of the paying account (the
// user of the establishment or of the independent doctor).
@Controller('admin/subscriptions')
@UseGuards(AdminJwtGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN_VERIFICATION)
export class AdminSubscriptionsController {
  constructor(private readonly subscriptions: AdminSubscriptionsService) {}

  @Get()
  list(@Query() query: ListSubscriptionsQueryDto) {
    return this.subscriptions.list(query);
  }

  @Get(':accountId')
  getDetail(
    @Param('accountId') accountId: string,
    @Req() request: AdminAuthenticatedRequest,
  ) {
    return this.subscriptions.getDetail(
      accountId,
      request.user.sub,
      getRequestContext(request),
    );
  }

  @Post(':accountId/extend-trial')
  @ThrottlePerIp({ limit: 20, ttl: 60_000 })
  extendTrial(
    @Param('accountId') accountId: string,
    @Body() dto: ExtendTrialDto,
    @Req() request: AdminAuthenticatedRequest,
  ) {
    return this.subscriptions.extendTrial(
      accountId,
      request.user.sub,
      dto,
      getRequestContext(request),
    );
  }

  @Post(':accountId/extend')
  @ThrottlePerIp({ limit: 20, ttl: 60_000 })
  extend(
    @Param('accountId') accountId: string,
    @Body() dto: ExtendSubscriptionDto,
    @Req() request: AdminAuthenticatedRequest,
  ) {
    return this.subscriptions.extend(
      accountId,
      request.user.sub,
      dto,
      getRequestContext(request),
    );
  }

  @Post(':accountId/cancel')
  @ThrottlePerIp({ limit: 20, ttl: 60_000 })
  cancel(
    @Param('accountId') accountId: string,
    @Body() dto: SubscriptionReasonDto,
    @Req() request: AdminAuthenticatedRequest,
  ) {
    return this.subscriptions.cancel(
      accountId,
      request.user.sub,
      dto,
      getRequestContext(request),
    );
  }

  @Patch(':accountId/quotas')
  @ThrottlePerIp({ limit: 20, ttl: 60_000 })
  updateQuotas(
    @Param('accountId') accountId: string,
    @Body() dto: UpdateSubscriptionQuotasDto,
    @Req() request: AdminAuthenticatedRequest,
  ) {
    return this.subscriptions.updateQuotas(
      accountId,
      request.user.sub,
      dto,
      getRequestContext(request),
    );
  }

  @Post(':accountId/activate-custom')
  @ThrottlePerIp({ limit: 20, ttl: 60_000 })
  activateCustom(
    @Param('accountId') accountId: string,
    @Body() dto: ActivateCustomSubscriptionDto,
    @Req() request: AdminAuthenticatedRequest,
  ) {
    return this.subscriptions.activateCustom(
      accountId,
      request.user.sub,
      dto,
      getRequestContext(request),
    );
  }
}
