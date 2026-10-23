import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { jwtSecret } from '../common/security/jwt-secrets';
import { DoctorsModule } from '../doctors/doctors.module';
import { EstablishmentsModule } from '../establishments/establishments.module';
import { MailModule } from '../mail/mail.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { UsersModule } from '../users/users.module';
import { WorkspaceModule } from '../workspaces/workspace.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { PasswordResetCleanupScheduler } from './password-reset/password-reset-cleanup.scheduler';
import { PasswordResetService } from './password-reset/password-reset.service';
import { AccessTokenStrategy } from './strategies/access-token.strategy';
import { RefreshTokenStrategy } from './strategies/refresh-token.strategy';

// Exported to be tested: in production this is where a weak secret stops the
// startup.
export const userJwtModuleOptions = (configService: ConfigService) => ({
  secret: jwtSecret(configService, 'JWT_ACCESS_SECRET'),
});

@Module({
  imports: [
    ConfigModule,
    PassportModule.register({ defaultStrategy: 'jwt-access' }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: userJwtModuleOptions,
    }),
    PrismaModule,
    UsersModule,
    EstablishmentsModule,
    DoctorsModule,
    AuditLogsModule,
    WorkspaceModule,
    MailModule,
    RealtimeModule,
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
  // The account settings hash a new password like the registration does.
  exports: [AuthService],
})
export class AuthModule {}
