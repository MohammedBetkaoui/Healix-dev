import { Module } from '@nestjs/common';

import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { VerificationDocumentService } from './documents/verification-document.service';
import { VerificationFileStorageService } from './documents/verification-file-storage.service';
import { VerificationFileValidator } from './documents/verification-file-validator';
import { DoctorVerificationService } from './doctor/doctor-verification.service';
import { EstablishmentVerificationService } from './establishment/establishment-verification.service';
import { VerificationController } from './verification.controller';
import { VerificationService } from './verification.service';

@Module({
  imports: [PrismaModule, AuditLogsModule],
  controllers: [VerificationController],
  providers: [
    VerificationService,
    DoctorVerificationService,
    EstablishmentVerificationService,
    VerificationDocumentService,
    VerificationFileStorageService,
    VerificationFileValidator,
    JwtAuthGuard,
    RolesGuard,
  ],
})
export class VerificationModule {}
