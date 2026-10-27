import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { DoctorsService } from './doctors.service';

// Only the doctor profile the registration creates; the team module owns
// the workspace members (invitations, suspension, reset links).
@Module({
  imports: [PrismaModule],
  providers: [DoctorsService],
  exports: [DoctorsService],
})
export class DoctorsModule {}
