import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { EstablishmentsService } from './establishments.service';

@Module({
  imports: [PrismaModule],
  providers: [EstablishmentsService],
  exports: [EstablishmentsService],
})
export class EstablishmentsModule {}
