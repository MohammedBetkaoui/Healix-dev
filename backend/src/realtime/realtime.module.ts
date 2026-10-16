import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { PrismaModule } from '../prisma/prisma.module';
import { RealtimeAuthenticator } from './realtime-auth';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimeService } from './realtime.service';

// Real-time notifications of the messaging (docs/messaging-design.md,
// section 6), at /api/realtime. Imported by the modules that emit or close
// sockets; Nest builds it once.
@Module({
  imports: [ConfigModule, PrismaModule, JwtModule.register({})],
  providers: [RealtimeAuthenticator, RealtimeGateway, RealtimeService],
  exports: [RealtimeService],
})
export class RealtimeModule {}
