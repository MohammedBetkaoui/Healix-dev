import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { type Request } from 'express';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { type AuthenticatedUserPayload } from '../auth/types/authenticated-request.type';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import { RolesGuard } from '../common/guards/roles.guard';
import { getRequestContext } from '../common/utils/request-context';
import { CreatePaymentIntentDto } from './dto/create-payment-intent.dto';
import { SyntheticChargilyPaymentDto } from './dto/synthetic-chargily-payment.dto';
import { UploadPaymentProofDto } from './dto/upload-payment-proof.dto';
import { PaymentsService } from './payments.service';

@Controller('payments')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ESTABLISHMENT_ADMIN, UserRole.INDEPENDENT_DOCTOR)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('create-intent')
  createIntent(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Body() dto: CreatePaymentIntentDto,
    @Req() request: Request,
  ) {
    return this.paymentsService.createIntent(
      user.sub,
      dto,
      getRequestContext(request),
    );
  }

  @Post(':paymentId/pay/synthetic-chargily')
  payWithSyntheticChargily(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('paymentId') paymentId: string,
    @Body() dto: SyntheticChargilyPaymentDto,
    @Req() request: Request,
  ) {
    return this.paymentsService.payWithSyntheticChargily(
      user.sub,
      paymentId,
      dto,
      getRequestContext(request),
    );
  }

  @Post(':paymentId/upload-proof')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: {
        fileSize: 5 * 1024 * 1024,
      },
    }),
  )
  uploadProof(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('paymentId') paymentId: string,
    @Body() dto: UploadPaymentProofDto,
    @UploadedFile() file: Express.Multer.File,
    @Req() request: Request,
  ) {
    return this.paymentsService.uploadProof(
      user.sub,
      paymentId,
      {
        file,
        proofType: dto.proofType,
      },
      getRequestContext(request),
    );
  }

  @Get(':paymentId')
  getPayment(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('paymentId') paymentId: string,
  ) {
    return this.paymentsService.getPayment(user.sub, paymentId);
  }
}
