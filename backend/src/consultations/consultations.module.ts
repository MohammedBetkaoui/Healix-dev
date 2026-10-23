import { Module } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PatientsModule } from '../patients/patients.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ConsultationsController } from './consultations.controller';
import { ConsultationsService } from './consultations.service';

@Module({
  imports: [PrismaModule, PatientsModule],
  controllers: [ConsultationsController],
  providers: [ConsultationsService, JwtAuthGuard, RolesGuard],
  exports: [ConsultationsService],
})
export class ConsultationsModule {}
