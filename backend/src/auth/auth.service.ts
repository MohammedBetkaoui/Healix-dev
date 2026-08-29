import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  type DoctorProfile,
  type Establishment,
  Prisma,
  type RefreshToken,
  type User,
} from '@prisma/client';
import { type Request, type Response } from 'express';
import * as bcrypt from 'bcrypt';

import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AccountStatus } from '../common/enums/account-status.enum';
import { SubscriptionStatus } from '../common/enums/subscription-status.enum';
import { UserRole } from '../common/enums/user-role.enum';
import { VerificationStatus } from '../common/enums/verification-status.enum';
import {
  getAccessCookieOptions,
  getClearCookieOptions,
  getRefreshCookieOptions,
} from '../common/utils/cookie-options';
import { toPublicUser, type PublicUser } from '../common/utils/public-user';
import {
  normalizeEmail,
  sanitizePhone,
  sanitizeTextInput,
  trimInput,
} from '../common/utils/sanitize';
import { DoctorsService } from '../doctors/doctors.service';
import { EstablishmentsService } from '../establishments/establishments.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { LoginDto, type LoginAccountType } from './dto/login.dto';
import { RegisterEstablishmentDto } from './dto/register-establishment.dto';
import { RegisterIndependentDoctorDto } from './dto/register-independent-doctor.dto';
import { type AuthenticatedUserPayload } from './types/authenticated-request.type';

type PrismaExecutor = PrismaService | Prisma.TransactionClient;

type RequestContext = {
  ipAddress?: string | null;
  userAgent?: string | null;
};

type RegistrationNextStep = 'PROFESSIONAL_VERIFICATION';

type RegisterEstablishmentResponse = {
  message: string;
  user: PublicUser;
  establishment: {
    id: string;
    name: string;
    type: string;
    wilaya: string;
    verificationStatus: string;
    subscriptionStatus: string;
  };
  nextStep: RegistrationNextStep;
};

type RegisterIndependentDoctorResponse = {
  message: string;
  user: PublicUser;
  doctorProfile: {
    id: string;
    speciality: string;
    wilaya: string;
    isIndependent: boolean;
    verificationStatus: string;
    subscriptionStatus: string;
  };
  nextStep: RegistrationNextStep;
};

type LoginResponse = {
  message: string;
  user: PublicUser;
  redirectTo: string;
};

type MeResponse = {
  user: PublicUser;
};

type LogoutResponse = {
  message: string;
};

type RefreshResponse = {
  message: string;
  user: PublicUser;
};

type SanitizedEstablishmentInput = {
  establishmentName: string;
  establishmentType: RegisterEstablishmentDto['establishmentType'];
  wilaya: string;
  address: string;
  professionalEmail: string;
  phone: string;
  managerFullName: string;
  password: string;
  confirmPassword: string;
  acceptTerms: boolean;
  acceptVerification: boolean;
};

type SanitizedIndependentDoctorInput = {
  fullName: string;
  speciality: string;
  wilaya: string;
  professionalAddress: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
  acceptTerms: boolean;
  acceptVerification: boolean;
};

type SanitizedLoginInput = {
  accountType: LoginAccountType;
  email: string;
  password: string;
};

type SessionTokens = {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
};

type SessionResult = {
  accessToken: string;
  refreshToken: string;
  publicUser: PublicUser;
};

const INVALID_LOGIN_MESSAGE = 'Email ou mot de passe incorrect.';
const FORBIDDEN_LOGIN_MESSAGE = 'Compte suspendu ou refuse.';

@Injectable()
export class AuthService {
  private readonly accessTokenExpiresIn: string;
  private readonly accessTokenMaxAgeMs: number;
  private readonly accessTokenSecret: string;
  private readonly cookieSecure: boolean;
  private readonly refreshTokenExpiresIn: string;
  private readonly refreshTokenMaxAgeMs: number;
  private readonly refreshTokenSecret: string;
  private readonly saltRounds: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly establishmentsService: EstablishmentsService,
    private readonly doctorsService: DoctorsService,
    private readonly auditLogsService: AuditLogsService,
    private readonly jwtService: JwtService,
    configService: ConfigService,
  ) {
    this.saltRounds = this.parseSaltRounds(
      configService.get<string>('BCRYPT_SALT_ROUNDS'),
    );
    this.accessTokenSecret =
      configService.get<string>('JWT_ACCESS_SECRET') ??
      'healixdz_access_secret_change_me';
    this.refreshTokenSecret =
      configService.get<string>('JWT_REFRESH_SECRET') ??
      'healixdz_refresh_secret_change_me';
    this.accessTokenExpiresIn =
      configService.get<string>('JWT_ACCESS_EXPIRES_IN') ?? '15m';
    this.refreshTokenExpiresIn =
      configService.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '7d';
    this.accessTokenMaxAgeMs = this.parseDurationToMs(
      this.accessTokenExpiresIn,
    );
    this.refreshTokenMaxAgeMs = this.parseDurationToMs(
      this.refreshTokenExpiresIn,
    );
    this.cookieSecure = this.parseBoolean(
      configService.get<string>('COOKIE_SECURE'),
    );
  }

  async login(
    dto: LoginDto,
    response: Response,
    context: RequestContext = {},
  ): Promise<LoginResponse> {
    // Frontend validation improves UX only. Backend validation remains mandatory.
    const input = this.sanitizeLoginInput(dto);
    const expectedRole = this.mapAccountTypeToRole(input.accountType);
    const authUser = await this.usersService.findAuthUserByEmail(input.email);

    if (!authUser || authUser.role !== expectedRole) {
      await this.auditLogsService.logLoginFailed({
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadata: {
          accountType: input.accountType,
          email: input.email,
        },
        userId: authUser?.id ?? null,
      });
      throw new UnauthorizedException(INVALID_LOGIN_MESSAGE);
    }

    const passwordMatches = await bcrypt.compare(
      input.password,
      authUser.passwordHash,
    );

    if (!passwordMatches) {
      await this.auditLogsService.logLoginFailed({
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadata: {
          accountType: input.accountType,
          email: input.email,
        },
        userId: authUser.id,
      });
      throw new UnauthorizedException(INVALID_LOGIN_MESSAGE);
    }

    this.assertAccountCanLogin(authUser.accountStatus);

    try {
      const { accessToken, refreshToken, refreshTokenExpiresAt } =
        await this.createSignedTokens(authUser);
      const refreshTokenHash = await this.hashSecret(refreshToken);

      const session = await this.prisma.$transaction(async (transaction) => {
        await transaction.refreshToken.create({
          data: {
            userId: authUser.id,
            tokenHash: refreshTokenHash,
            userAgent: context.userAgent,
            ipAddress: context.ipAddress,
            expiresAt: refreshTokenExpiresAt,
          },
        });

        await this.auditLogsService.logLoginSuccess(
          {
            userId: authUser.id,
            ipAddress: context.ipAddress,
            userAgent: context.userAgent,
            metadata: {
              role: authUser.role,
              accountStatus: authUser.accountStatus,
            },
          },
          transaction,
        );

        return {
          accessToken,
          refreshToken,
          publicUser: toPublicUser(authUser),
        } satisfies SessionResult;
      });

      this.setAuthCookies(response, session.accessToken, session.refreshToken);

      return {
        message: 'Connexion reussie.',
        user: session.publicUser,
        redirectTo: this.getRedirectPath(session.publicUser.role),
      };
    } catch (error) {
      this.handleKnownPrismaError(error);
      throw new InternalServerErrorException(
        'Une erreur est survenue lors de la connexion.',
      );
    }
  }

  async getCurrentUser(userId: string): Promise<MeResponse> {
    const user = await this.usersService.findPublicUserById(userId);

    if (!user) {
      throw new UnauthorizedException('Session invalide.');
    }

    return { user };
  }

  async refreshSession(
    payload: AuthenticatedUserPayload,
    response: Response,
    context: RequestContext = {},
  ): Promise<RefreshResponse> {
    if (!payload.refreshToken) {
      throw new UnauthorizedException('Session invalide.');
    }

    const authUser = await this.usersService.findAuthUserById(payload.sub);

    if (!authUser || authUser.role !== payload.role) {
      throw new UnauthorizedException('Session invalide.');
    }

    this.assertAccountCanLogin(authUser.accountStatus);

    const matchedToken = await this.findMatchingRefreshToken(
      authUser.id,
      payload.refreshToken,
    );

    if (!matchedToken) {
      throw new UnauthorizedException('Session invalide.');
    }

    const { accessToken, refreshToken, refreshTokenExpiresAt } =
      await this.createSignedTokens(authUser);
    const refreshTokenHash = await this.hashSecret(refreshToken);

    const session = await this.prisma.$transaction(async (transaction) => {
      await transaction.refreshToken.update({
        where: { id: matchedToken.id },
        data: { revokedAt: new Date() },
      });

      await transaction.refreshToken.create({
        data: {
          userId: authUser.id,
          tokenHash: refreshTokenHash,
          userAgent: context.userAgent,
          ipAddress: context.ipAddress,
          expiresAt: refreshTokenExpiresAt,
        },
      });

      return {
        accessToken,
        refreshToken,
        publicUser: toPublicUser(authUser),
      } satisfies SessionResult;
    });

    this.setAuthCookies(response, session.accessToken, session.refreshToken);

    return {
      message: 'Session renouvelee.',
      user: session.publicUser,
    };
  }

  async logout(
    request: Request,
    response: Response,
    context: RequestContext = {},
  ): Promise<LogoutResponse> {
    const refreshToken =
      request.cookies && typeof request.cookies.refresh_token === 'string'
        ? request.cookies.refresh_token
        : null;
    const accessToken =
      request.cookies && typeof request.cookies.access_token === 'string'
        ? request.cookies.access_token
        : null;

    const refreshPayload = refreshToken
      ? await this.tryVerifyToken(refreshToken, this.refreshTokenSecret)
      : null;
    const accessPayload = accessToken
      ? await this.tryVerifyToken(accessToken, this.accessTokenSecret)
      : null;
    const userId = refreshPayload?.sub ?? accessPayload?.sub ?? null;

    if (refreshToken && refreshPayload?.sub) {
      const matchedToken = await this.findMatchingRefreshToken(
        refreshPayload.sub,
        refreshToken,
      );

      if (matchedToken) {
        await this.prisma.refreshToken.update({
          where: { id: matchedToken.id },
          data: { revokedAt: new Date() },
        });
      }
    }

    this.clearAuthCookies(response);

    if (userId) {
      await this.auditLogsService.logLogout({
        userId,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      });
    }

    return {
      message: 'Deconnexion reussie.',
    };
  }

  async registerEstablishment(
    dto: RegisterEstablishmentDto,
    context: RequestContext = {},
  ): Promise<RegisterEstablishmentResponse> {
    // Frontend validation is useful for UX only. Every rule must be repeated on the backend before trusting data.
    // Rate limiting must be enforced on backend. Email verification and phone OTP can be added before activation.
    const input = this.sanitizeRegisterEstablishmentInput(dto);
    this.assertRegistrationBusinessRules(input, {
      termsMessage: 'Veuillez accepter les conditions.',
      verificationMessage: 'Veuillez accepter les conditions.',
    });

    try {
      const passwordHash = await this.hashPassword(input.password);

      return await this.prisma.$transaction(async (transaction) => {
        await this.usersService.ensureEmailAndPhoneAvailable(
          input.professionalEmail,
          input.phone,
          transaction,
        );

        const user = await this.usersService.createUser(
          {
            fullName: input.managerFullName,
            email: input.professionalEmail,
            phone: input.phone,
            passwordHash,
            role: UserRole.ESTABLISHMENT_ADMIN,
            accountStatus: AccountStatus.BASIC_ACCOUNT,
          },
          transaction,
        );

        const establishment =
          await this.establishmentsService.createEstablishment(
            {
              name: input.establishmentName,
              type: input.establishmentType,
              wilaya: input.wilaya,
              address: input.address,
              professionalEmail: input.professionalEmail,
              phone: input.phone,
              managerFullName: input.managerFullName,
              verificationStatus: VerificationStatus.NOT_STARTED,
              subscriptionStatus: SubscriptionStatus.NO_PLAN,
              ownerId: user.id,
            },
            transaction,
          );

        await this.auditLogsService.createAuditLog(
          {
            userId: user.id,
            action: 'ESTABLISHMENT_REGISTERED',
            entityType: 'ESTABLISHMENT',
            entityId: establishment.id,
            ipAddress: context.ipAddress,
            userAgent: context.userAgent,
            metadata: {
              accountStatus: AccountStatus.BASIC_ACCOUNT,
              verificationStatus: VerificationStatus.NOT_STARTED,
              subscriptionStatus: SubscriptionStatus.NO_PLAN,
              nextStep: 'PROFESSIONAL_VERIFICATION',
            },
          },
          transaction,
        );

        return {
          message:
            'Compte etablissement cree avec succes. Vous pouvez acceder au mode demonstration.',
          user: toPublicUser(user),
          establishment: this.toRegisterEstablishmentResponse(establishment),
          nextStep: 'PROFESSIONAL_VERIFICATION',
        };
      });
    } catch (error) {
      this.rethrowRegistrationError(error);
    }
  }

  async registerIndependentDoctor(
    dto: RegisterIndependentDoctorDto,
    context: RequestContext = {},
  ): Promise<RegisterIndependentDoctorResponse> {
    // Frontend validation is useful for UX only. Every rule must be repeated on the backend before trusting data.
    // Rate limiting must be enforced on backend. Email verification, phone OTP, professional documents and payments come later.
    const input = this.sanitizeRegisterIndependentDoctorInput(dto);
    this.assertRegistrationBusinessRules(input, {
      termsMessage: "Vous devez accepter les conditions d'utilisation.",
      verificationMessage:
        'Vous devez accepter la verification professionnelle.',
    });

    try {
      const passwordHash = await this.hashPassword(input.password);

      return await this.prisma.$transaction(async (transaction) => {
        await this.usersService.ensureEmailAndPhoneAvailable(
          input.email,
          input.phone,
          transaction,
        );

        const user = await this.usersService.createUser(
          {
            fullName: input.fullName,
            email: input.email,
            phone: input.phone,
            passwordHash,
            role: UserRole.INDEPENDENT_DOCTOR,
            accountStatus: AccountStatus.BASIC_ACCOUNT,
          },
          transaction,
        );

        const doctorProfile =
          await this.doctorsService.createIndependentDoctorProfile(
            {
              userId: user.id,
              speciality: input.speciality,
              wilaya: input.wilaya,
              professionalAddress: input.professionalAddress,
              verificationStatus: VerificationStatus.NOT_STARTED,
              subscriptionStatus: SubscriptionStatus.NO_PLAN,
            },
            transaction,
          );

        await this.auditLogsService.createAuditLog(
          {
            userId: user.id,
            action: 'REGISTER_INDEPENDENT_DOCTOR',
            entityType: 'DOCTOR_PROFILE',
            entityId: doctorProfile.id,
            ipAddress: context.ipAddress,
            userAgent: context.userAgent,
            metadata: {
              role: UserRole.INDEPENDENT_DOCTOR,
              accountStatus: AccountStatus.BASIC_ACCOUNT,
              verificationStatus: VerificationStatus.NOT_STARTED,
              subscriptionStatus: SubscriptionStatus.NO_PLAN,
            },
          },
          transaction,
        );

        return {
          message:
            'Compte medecin cree avec succes. Vous pouvez acceder au mode demonstration.',
          user: toPublicUser(user),
          doctorProfile: this.toRegisterDoctorProfileResponse(doctorProfile),
          nextStep: 'PROFESSIONAL_VERIFICATION',
        };
      });
    } catch (error) {
      this.rethrowRegistrationError(error);
    }
  }

  private sanitizeRegisterEstablishmentInput(
    dto: RegisterEstablishmentDto,
  ): SanitizedEstablishmentInput {
    return {
      establishmentName: sanitizeTextInput(dto.establishmentName),
      establishmentType: dto.establishmentType,
      wilaya: sanitizeTextInput(dto.wilaya),
      address: sanitizeTextInput(dto.address),
      professionalEmail: normalizeEmail(dto.professionalEmail),
      phone: sanitizePhone(dto.phone),
      managerFullName: sanitizeTextInput(dto.managerFullName),
      password: trimInput(dto.password),
      confirmPassword: trimInput(dto.confirmPassword),
      acceptTerms: dto.acceptTerms,
      acceptVerification: dto.acceptVerification,
    };
  }

  private sanitizeRegisterIndependentDoctorInput(
    dto: RegisterIndependentDoctorDto,
  ): SanitizedIndependentDoctorInput {
    return {
      fullName: sanitizeTextInput(dto.fullName),
      speciality: sanitizeTextInput(dto.speciality),
      wilaya: sanitizeTextInput(dto.wilaya),
      professionalAddress: sanitizeTextInput(dto.professionalAddress),
      email: normalizeEmail(dto.email),
      phone: sanitizePhone(dto.phone),
      password: trimInput(dto.password),
      confirmPassword: trimInput(dto.confirmPassword),
      acceptTerms: dto.acceptTerms,
      acceptVerification: dto.acceptVerification,
    };
  }

  private sanitizeLoginInput(dto: LoginDto): SanitizedLoginInput {
    return {
      accountType: dto.accountType,
      email: normalizeEmail(dto.email),
      password: trimInput(dto.password),
    };
  }

  private assertRegistrationBusinessRules(
    input: {
      password: string;
      confirmPassword: string;
      acceptTerms: boolean;
      acceptVerification: boolean;
    },
    messages: {
      termsMessage: string;
      verificationMessage: string;
    },
  ): void {
    if (input.password !== input.confirmPassword) {
      throw new BadRequestException('Les mots de passe ne correspondent pas.');
    }

    if (!input.acceptTerms) {
      throw new BadRequestException(messages.termsMessage);
    }

    if (!input.acceptVerification) {
      throw new BadRequestException(messages.verificationMessage);
    }
  }

  private assertAccountCanLogin(accountStatus: string): void {
    if (
      accountStatus === AccountStatus.SUSPENDED ||
      accountStatus === AccountStatus.REJECTED
    ) {
      throw new ForbiddenException(FORBIDDEN_LOGIN_MESSAGE);
    }
  }

  private async createSignedTokens(user: Pick<User, 'id' | 'email' | 'role'>) {
    const accessPayload: AuthenticatedUserPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      tokenType: 'access',
    };
    const refreshPayload: AuthenticatedUserPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      tokenType: 'refresh',
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(accessPayload, {
        expiresIn: Math.floor(this.accessTokenMaxAgeMs / 1_000),
        secret: this.accessTokenSecret,
      }),
      this.jwtService.signAsync(refreshPayload, {
        expiresIn: Math.floor(this.refreshTokenMaxAgeMs / 1_000),
        secret: this.refreshTokenSecret,
      }),
    ]);

    return {
      accessToken,
      refreshToken,
      refreshTokenExpiresAt: new Date(Date.now() + this.refreshTokenMaxAgeMs),
    } satisfies SessionTokens;
  }

  private async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, this.saltRounds);
  }

  private async hashSecret(secret: string): Promise<string> {
    return bcrypt.hash(secret, this.saltRounds);
  }

  private setAuthCookies(
    response: Response,
    accessToken: string,
    refreshToken: string,
  ): void {
    response.cookie(
      'access_token',
      accessToken,
      getAccessCookieOptions(this.cookieSecure, this.accessTokenMaxAgeMs),
    );
    response.cookie(
      'refresh_token',
      refreshToken,
      getRefreshCookieOptions(this.cookieSecure, this.refreshTokenMaxAgeMs),
    );
  }

  private clearAuthCookies(response: Response): void {
    const clearOptions = getClearCookieOptions(this.cookieSecure);

    response.clearCookie('access_token', clearOptions);
    response.clearCookie('refresh_token', clearOptions);
  }

  private async findMatchingRefreshToken(
    userId: string,
    refreshToken: string,
    client: PrismaExecutor = this.prisma,
  ): Promise<RefreshToken | null> {
    const activeTokens = await client.refreshToken.findMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: {
          gt: new Date(),
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    for (const tokenRecord of activeTokens) {
      const matches = await bcrypt.compare(refreshToken, tokenRecord.tokenHash);

      if (matches) {
        return tokenRecord;
      }
    }

    return null;
  }

  private async tryVerifyToken(
    token: string,
    secret: string,
  ): Promise<AuthenticatedUserPayload | null> {
    try {
      return await this.jwtService.verifyAsync<AuthenticatedUserPayload>(
        token,
        {
          secret,
        },
      );
    } catch {
      return null;
    }
  }

  private mapAccountTypeToRole(accountType: LoginAccountType): UserRole {
    if (accountType === 'ESTABLISHMENT') {
      return UserRole.ESTABLISHMENT_ADMIN;
    }

    return UserRole.INDEPENDENT_DOCTOR;
  }

  private getRedirectPath(role: UserRole): string {
    if (role === UserRole.ESTABLISHMENT_ADMIN) {
      return '/establishment/dashboard';
    }

    return '/doctor/dashboard';
  }

  private toRegisterEstablishmentResponse(establishment: Establishment) {
    return {
      id: establishment.id,
      name: establishment.name,
      type: establishment.type,
      wilaya: establishment.wilaya,
      verificationStatus: establishment.verificationStatus,
      subscriptionStatus: establishment.subscriptionStatus,
    };
  }

  private toRegisterDoctorProfileResponse(doctorProfile: DoctorProfile) {
    return {
      id: doctorProfile.id,
      speciality: doctorProfile.speciality,
      wilaya: doctorProfile.wilaya,
      isIndependent: doctorProfile.isIndependent,
      verificationStatus: doctorProfile.verificationStatus,
      subscriptionStatus: doctorProfile.subscriptionStatus,
    };
  }

  private rethrowRegistrationError(error: unknown): never {
    if (
      error instanceof BadRequestException ||
      error instanceof ConflictException
    ) {
      throw error;
    }

    this.handleKnownPrismaError(error);

    throw new InternalServerErrorException(
      "Une erreur inattendue est survenue lors de l'inscription.",
    );
  }

  private handleKnownPrismaError(error: unknown): never | void {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
      return;
    }

    if (error.code !== 'P2002') {
      return;
    }

    const target = error.meta?.target;
    const targetValue = Array.isArray(target)
      ? target.join(' ')
      : typeof target === 'string'
        ? target
        : '';

    if (targetValue.includes('email')) {
      throw new ConflictException('Cet email est deja utilise.');
    }

    if (targetValue.includes('phone')) {
      throw new ConflictException('Ce numero de telephone est deja utilise.');
    }

    throw new ConflictException('Ces informations sont deja utilisees.');
  }

  private parseSaltRounds(value: string | undefined): number {
    const parsedValue = Number(value);

    if (Number.isInteger(parsedValue) && parsedValue >= 10) {
      return parsedValue;
    }

    return 12;
  }

  private parseBoolean(value: string | undefined): boolean {
    return value === 'true';
  }

  private parseDurationToMs(duration: string): number {
    const match = duration.trim().match(/^(\d+)([smhd])$/i);

    if (!match) {
      throw new Error(`Invalid duration format: ${duration}`);
    }

    const value = Number(match[1]);
    const unit = match[2].toLowerCase();

    if (unit === 's') {
      return value * 1_000;
    }

    if (unit === 'm') {
      return value * 60_000;
    }

    if (unit === 'h') {
      return value * 3_600_000;
    }

    return value * 86_400_000;
  }
}
