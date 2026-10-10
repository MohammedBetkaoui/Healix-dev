import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { DoctorsModule } from '../doctors/doctors.module';
import { EstablishmentsModule } from '../establishments/establishments.module';
import { MailModule } from '../mail/mail.module';
import { PrismaModule } from '../prisma/prisma.module';
import { UsersModule } from '../users/users.module';
import { WorkspaceModule } from '../workspaces/workspace.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { PasswordResetCleanupScheduler } from './password-reset/password-reset-cleanup.scheduler';
import { PasswordResetService } from './password-reset/password-reset.service';
import { AccessTokenStrategy } from './strategies/access-token.strategy';
import { RefreshTokenStrategy } from './strategies/refresh-token.strategy';

@Module({
  imports: [
    ConfigModule,
    PassportModule.register({ defaultStrategy: 'jwt-access' }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret:
          configService.get<string>('JWT_ACCESS_SECRET') ??
          'healixdz_access_secret_change_me',
      }),
    }),
    PrismaModule,
    UsersModule,
    EstablishmentsModule,
    DoctorsModule,
    AuditLogsModule,
    WorkspaceModule,
    MailModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtAuthGuard,
    AccessTokenStrategy,
    RefreshTokenStrategy,
    PasswordResetService,
    PasswordResetCleanupScheduler,
  ],
})
export class AuthModule {}
