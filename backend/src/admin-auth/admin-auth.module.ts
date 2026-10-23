import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { jwtSecret } from '../common/security/jwt-secrets';
import { PrismaModule } from '../prisma/prisma.module';
import { UsersModule } from '../users/users.module';
import { AdminAuthController } from './admin-auth.controller';
import { AdminAuthService } from './admin-auth.service';
import { AdminJwtGuard } from './guards/admin-jwt.guard';
import { AdminAccessTokenStrategy } from './strategies/admin-access-token.strategy';
import { AdminRefreshTokenStrategy } from './strategies/admin-refresh-token.strategy';

// Exported to be tested: in production this is where a weak secret stops the
// startup.
export const adminJwtModuleOptions = (configService: ConfigService) => ({
  secret: jwtSecret(configService, 'ADMIN_JWT_ACCESS_SECRET'),
});

@Module({
  imports: [
    ConfigModule,
    PassportModule.register({ defaultStrategy: 'admin-jwt-access' }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: adminJwtModuleOptions,
    }),
    PrismaModule,
    UsersModule,
    AuditLogsModule,
  ],
  controllers: [AdminAuthController],
  providers: [
    AdminAuthService,
    AdminJwtGuard,
    AdminAccessTokenStrategy,
    AdminRefreshTokenStrategy,
  ],
})
export class AdminAuthModule {}
