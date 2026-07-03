import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { type Response } from 'express';

import { AdminJwtGuard } from '../../admin-auth/guards/admin-jwt.guard';
import { type AdminAuthenticatedRequest } from '../../admin-auth/types/admin-authenticated-request.type';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { RolesGuard } from '../../common/guards/roles.guard';
import { getRequestContext } from '../../common/utils/request-context';
import {
  AdminApprovePaymentDto,
  AdminRejectPaymentDto,
} from '../dto/admin-review-payment.dto';
import { ListPaymentsQueryDto } from '../dto/list-payments-query.dto';
import { AdminPaymentsService } from './admin-payments.service';

@Controller('admin/payments')
@UseGuards(AdminJwtGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN_VERIFICATION)
export class AdminPaymentsController {
  constructor(private readonly paymentsService: AdminPaymentsService) {}

  @Get()
  listPayments(@Query() query: ListPaymentsQueryDto) {
    return this.paymentsService.listPayments(query);
  }

  @Get(':id')
  getPaymentById(
    @Param('id') id: string,
    @Req() request: AdminAuthenticatedRequest,
  ) {
    return this.paymentsService.getPaymentById(
      id,
      request.user.sub,
      getRequestContext(request),
    );
  }

  @Get(':id/proof/view')
  async viewProof(
    @Param('id') id: string,
    @Req() request: AdminAuthenticatedRequest,
    @Res() response: Response,
  ) {
    const proof = await this.paymentsService.getProofStream(
      id,
      request.user.sub,
      'inline',
      getRequestContext(request),
    );

    response.setHeader('Content-Type', proof.mimeType);
    response.setHeader('Content-Length', String(proof.size));
    response.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(proof.originalName)}"`,
    );
    proof.stream.pipe(response);
  }

  @Get(':id/proof/download')
  async downloadProof(
    @Param('id') id: string,
    @Req() request: AdminAuthenticatedRequest,
    @Res() response: Response,
  ) {
    const proof = await this.paymentsService.getProofStream(
      id,
      request.user.sub,
      'attachment',
      getRequestContext(request),
    );

    response.setHeader('Content-Type', proof.mimeType);
    response.setHeader('Content-Length', String(proof.size));
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(proof.originalName)}"`,
    );
    proof.stream.pipe(response);
  }

  @Patch(':id/approve')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  approvePayment(
    @Param('id') id: string,
    @Body() dto: AdminApprovePaymentDto,
    @Req() request: AdminAuthenticatedRequest,
  ) {
    return this.paymentsService.approvePayment(
      id,
      request.user.sub,
      dto,
      getRequestContext(request),
    );
  }

  @Patch(':id/reject')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  rejectPayment(
    @Param('id') id: string,
    @Body() dto: AdminRejectPaymentDto,
    @Req() request: AdminAuthenticatedRequest,
  ) {
    return this.paymentsService.rejectPayment(
      id,
      request.user.sub,
      dto,
      getRequestContext(request),
    );
  }

  @Patch(':id/activate-cash')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  activateCashPayment(
    @Param('id') id: string,
    @Body() dto: AdminApprovePaymentDto,
    @Req() request: AdminAuthenticatedRequest,
  ) {
    return this.paymentsService.activateCashPayment(
      id,
      request.user.sub,
      dto,
      getRequestContext(request),
    );
  }
}
