import {
  type CanActivate,
  Controller,
  type ExecutionContext,
  ForbiddenException,
  Get,
  type INestApplication,
  UseGuards,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { type App } from 'supertest/types';

import { type AuthenticatedUserPayload } from '../../auth/types/authenticated-request.type';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountStatus } from '../enums/account-status.enum';
import { UserRole } from '../enums/user-role.enum';
import { VerificationStatus } from '../enums/verification-status.enum';
import {
  VERIFICATION_REQUIRED_CODE,
  VerifiedAccountGuard,
} from './verified-account.guard';

type Account = {
  accountStatus: string;
  doctorProfile: { verificationStatus: string } | null;
  establishment: { verificationStatus: string } | null;
};

const verificationRequiredBody = {
  code: VERIFICATION_REQUIRED_CODE,
  message:
    'Votre compte doit être vérifié pour accéder à cette fonctionnalité.',
};

function contextFor(user: Partial<AuthenticatedUserPayload> | undefined) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

function establishmentAccount(
  verificationStatus: string,
  accountStatus: string = AccountStatus.ACTIVE,
): Account {
  return {
    accountStatus,
    doctorProfile: null,
    establishment: { verificationStatus },
  };
}

function doctorAccount(
  verificationStatus: string,
  accountStatus: string = AccountStatus.ACTIVE,
): Account {
  return {
    accountStatus,
    doctorProfile: { verificationStatus },
    establishment: null,
  };
}

describe('VerifiedAccountGuard', () => {
  const findUnique = jest.fn();
  const prisma = { user: { findUnique } } as unknown as PrismaService;
  const guard = new VerifiedAccountGuard(prisma);

  const establishmentAdmin = {
    sub: 'user-establishment',
    role: UserRole.ESTABLISHMENT_ADMIN,
  };
  const independentDoctor = {
    sub: 'user-doctor',
    role: UserRole.INDEPENDENT_DOCTOR,
  };

  async function expectVerificationRequired(
    user: Partial<AuthenticatedUserPayload>,
  ) {
    const error: unknown = await guard
      .canActivate(contextFor(user))
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ForbiddenException);
    expect((error as ForbiddenException).getResponse()).toEqual(
      verificationRequiredBody,
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lets a verified establishment through, reading the account in one query', async () => {
    findUnique.mockResolvedValue(
      establishmentAccount(VerificationStatus.VERIFIED),
    );

    await expect(
      guard.canActivate(contextFor(establishmentAdmin)),
    ).resolves.toBe(true);

    expect(findUnique).toHaveBeenCalledTimes(1);
    expect(findUnique).toHaveBeenCalledWith({
      select: {
        accountStatus: true,
        doctorProfile: { select: { verificationStatus: true } },
        establishment: { select: { verificationStatus: true } },
      },
      where: { id: 'user-establishment' },
    });
  });

  it('requires verification, not a subscription (VERIFIED_NO_PLAN passes)', async () => {
    findUnique.mockResolvedValue(
      doctorAccount(
        VerificationStatus.VERIFIED,
        AccountStatus.VERIFIED_NO_PLAN,
      ),
    );

    await expect(
      guard.canActivate(contextFor(independentDoctor)),
    ).resolves.toBe(true);
  });

  it.each([
    VerificationStatus.NOT_STARTED,
    VerificationStatus.DRAFT,
    VerificationStatus.PENDING_VERIFICATION,
    VerificationStatus.REJECTED,
    VerificationStatus.SUSPENDED,
  ])('refuses a %s verification with VERIFICATION_REQUIRED', async (status) => {
    findUnique.mockResolvedValue(doctorAccount(status));

    await expectVerificationRequired(independentDoctor);
  });

  it.each([AccountStatus.SUSPENDED, AccountStatus.REJECTED])(
    'refuses a verified profile whose account is %s',
    async (accountStatus) => {
      findUnique.mockResolvedValue(
        establishmentAccount(VerificationStatus.VERIFIED, accountStatus),
      );

      await expectVerificationRequired(establishmentAdmin);
    },
  );

  it('lets a verified affiliated doctor through (no Subscription needed)', async () => {
    findUnique.mockResolvedValue(doctorAccount(VerificationStatus.VERIFIED));

    await expect(
      guard.canActivate(
        contextFor({
          sub: 'user-affiliated',
          role: UserRole.AFFILIATED_DOCTOR,
        }),
      ),
    ).resolves.toBe(true);
  });

  it('reads the profile matching the role, never the other one', async () => {
    // A doctor token must be judged on doctorProfile only.
    findUnique.mockResolvedValue({
      accountStatus: AccountStatus.ACTIVE,
      doctorProfile: { verificationStatus: VerificationStatus.NOT_STARTED },
      establishment: { verificationStatus: VerificationStatus.VERIFIED },
    });

    await expectVerificationRequired(independentDoctor);
  });

  it('refuses an account whose profile row or user row is missing', async () => {
    findUnique.mockResolvedValueOnce({
      accountStatus: AccountStatus.ACTIVE,
      doctorProfile: null,
      establishment: null,
    });
    await expectVerificationRequired(establishmentAdmin);

    findUnique.mockResolvedValueOnce(null);
    await expectVerificationRequired(establishmentAdmin);
  });

  it.each([UserRole.SUPER_ADMIN, UserRole.ADMIN_VERIFICATION])(
    'does not block the %s role, which has no professional profile',
    async (role) => {
      await expect(
        guard.canActivate(contextFor({ sub: 'admin-1', role })),
      ).resolves.toBe(true);
      expect(findUnique).not.toHaveBeenCalled();
    },
  );

  it('refuses a request without an authenticated user', async () => {
    await expectVerificationRequired(undefined as never);
    expect(findUnique).not.toHaveBeenCalled();
  });
});

// The structured body must reach the client through Nest's default exception
// filter (there is no global filter): checked over HTTP on a real app.
describe('VerifiedAccountGuard HTTP response', () => {
  class FakeJwtGuard implements CanActivate {
    canActivate(context: ExecutionContext) {
      context.switchToHttp().getRequest<{ user: unknown }>().user = {
        sub: 'user-doctor',
        role: UserRole.INDEPENDENT_DOCTOR,
      };
      return true;
    }
  }

  @Controller('guarded')
  @UseGuards(FakeJwtGuard, VerifiedAccountGuard)
  class GuardedController {
    @Get()
    read() {
      return { ok: true };
    }
  }

  const findUnique = jest.fn();
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [GuardedController],
      providers: [
        { provide: PrismaService, useValue: { user: { findUnique } } },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('answers 403 with { code, message } for an unverified account', async () => {
    findUnique.mockResolvedValue(
      doctorAccount(VerificationStatus.PENDING_VERIFICATION),
    );

    const response = await request(app.getHttpServer()).get('/guarded');

    expect(response.status).toBe(403);
    expect(response.body).toEqual(verificationRequiredBody);
  });

  it('reaches the handler for a verified account', async () => {
    findUnique.mockResolvedValue(doctorAccount(VerificationStatus.VERIFIED));

    const response = await request(app.getHttpServer()).get('/guarded');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });
});
