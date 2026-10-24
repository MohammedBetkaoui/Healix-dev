import { All, Controller, Req, Res, UseGuards } from '@nestjs/common';
import { type Request, type Response } from 'express';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { type AuthenticatedUserPayload } from '../auth/types/authenticated-request.type';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import { ThrottlePerUser } from '../common/guards/app-throttler.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { VerifiedAccountGuard } from '../common/guards/verified-account.guard';
import { DicomWebProxyService } from './dicomweb-proxy.service';

// The DICOMweb API of the viewer, in front of Orthanc: authenticated by the
// session cookie like the patient record, GET only, one authorized study per
// request (see DicomWebProxyService). Same guards as reading a record, and no
// @RequiresActiveSubscription: an account in read-only mode still sees its
// images.
//
// A viewer asks for hundreds of images in a few seconds, so this route has a
// limit of its own, per user, far above the usual 600 requests a minute.
@Controller('dicomweb')
@UseGuards(JwtAuthGuard, RolesGuard, VerifiedAccountGuard, SubscriptionGuard)
@Roles(
  UserRole.ESTABLISHMENT_ADMIN,
  UserRole.AFFILIATED_DOCTOR,
  UserRole.INDEPENDENT_DOCTOR,
)
@ThrottlePerUser({ limit: 6000, ttl: 60_000 })
export class DicomWebController {
  constructor(private readonly proxy: DicomWebProxyService) {}

  // Every verb reaches the service, which answers 405 to all but GET: a
  // route per verb would leave the others to a 404.
  @All('*path')
  async handle(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    await this.proxy.handle(user, request, response);
  }
}
