import { Module } from '@nestjs/common';

import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { PatientFileStorageService } from './documents/patient-file-storage.service';
import { PatientFileValidator } from './documents/patient-file-validator';
import { PatientsController } from './patients.controller';
import { PatientsService } from './patients.service';

@Module({
  imports: [PrismaModule, AuditLogsModule],
  controllers: [PatientsController],
  providers: [
    PatientsService,
    JwtAuthGuard,
    RolesGuard,
    PatientFileValidator,
    PatientFileStorageService,
  ],
})
export class PatientsModule {}
