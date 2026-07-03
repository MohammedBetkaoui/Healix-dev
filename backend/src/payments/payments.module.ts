import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { AdminPaymentsController } from './admin/admin-payments.controller';
import { AdminPaymentsService } from './admin/admin-payments.service';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PaymentProofService } from './proofs/payment-proof.service';
import { PaymentProofStorageService } from './proofs/payment-proof-storage.service';
import { PaymentProofValidator } from './proofs/payment-proof-validator';

@Module({
  imports: [ConfigModule, PrismaModule, AuditLogsModule, SubscriptionsModule],
  controllers: [PaymentsController, AdminPaymentsController],
  providers: [
    AdminPaymentsService,
    PaymentsService,
    PaymentProofService,
    PaymentProofStorageService,
    PaymentProofValidator,
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
