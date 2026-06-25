import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { DoctorsService } from './doctors.service';

@Module({
  imports: [PrismaModule],
  providers: [DoctorsService],
  exports: [DoctorsService],
})
export class DoctorsModule {}
