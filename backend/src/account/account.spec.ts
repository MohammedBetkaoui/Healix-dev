/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
// The rows of the in-memory tables below are untyped on purpose: they stand in
// for Prisma, whatever the services ask for.
import { ConflictException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import * as bcrypt from 'bcrypt';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ResetPasswordDto } from '../auth/password-reset/password-reset.dto';
import { hashRefreshToken } from '../auth/refresh-token-hash';
import { type AuthService } from '../auth/auth.service';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { trackByIp } from '../common/guards/app-throttler.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { type AuditLogsService } from '../audit-logs/audit-logs.service';
import { type MailMessage, type MailService } from '../mail/mail.service';
import { type PrismaService } from '../prisma/prisma.service';
import { type RealtimeService } from '../realtime/realtime.service';
import { AccountController } from './account.controller';
import { AccountSessionsService } from './account-sessions.service';
import { AccountService } from './account.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateAccountProfileDto } from './dto/update-account-profile.dto';

type Where = Record<string, unknown>;
type Row = Record<string, any>;
type AuditEntry = {
  action: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  userId?: string | null;
};

const HOUR_MS = 3_600_000;
// bcrypt cuts what it hashes at 72 bytes: tokens that share their first 72
// are what a user's refresh tokens look like.
const SHARED_PREFIX = 'x'.repeat(80);
const tokenOf = (device: string) => `${SHARED_PREFIX}.${device}`;

// Applies the where clauses the services send, so that a missing condition
// shows up as a wrong result. Anything it does not know fails the test.
function matches(row: Row, where: Where): boolean {
  return Object.entries(where).every(([key, condition]) => {
    const value = row[key];

    if (condition === undefined) return true;
    if (condition === null) return value === null;
    if (condition instanceof Date || typeof condition !== 'object') {
      return value === condition;
    }

    return Object.entries(condition as Record<string, unknown>).every(
      ([operator, bound]) => {
        if (operator === 'gt') {
          return (value as Date).getTime() > (bound as Date).getTime();
        }
        if (operator === 'not') return value !== bound;
        throw new Error(`Unsupported operator ${operator}`);
      },
    );
  });
}

const doctorUser = (overrides: Row = {}): Row => ({
  accountStatus: 'ACTIVE',
  createdAt: new Date('2026-01-10T09:00:00Z'),
  email: 'doctor@example.dz',
  fullName: 'Samir Kaci',
  id: 'user-doctor',
  isEmailVerified: false,
  isPhoneVerified: true,
  passwordHash: '',
  phone: '0550000001',
  role: 'INDEPENDENT_DOCTOR',
  ...overrides,
});

const establishmentUser = (overrides: Row = {}): Row => ({
  ...doctorUser(),
  email: 'clinic@example.dz',
  fullName: 'Nadia Hamidi',
  id: 'user-clinic',
  phone: '0550000002',
  role: 'ESTABLISHMENT_ADMIN',
  ...overrides,
});

function createDatabase(verificationStatus: string) {
  const users: Row[] = [
    doctorUser(),
    establishmentUser(),
    doctorUser({
      email: 'other@example.dz',
      id: 'user-other',
      phone: '0550000003',
    }),
  ];
  const doctors: Row[] = [
    {
      establishmentId: null,
      id: 'profile-doctor',
      isIndependent: true,
      professionalAddress: '12 rue Didouche Mourad, Alger',
      speciality: 'Cardiologie',
      subscriptionStatus: 'NO_PLAN',
      userId: 'user-doctor',
      verificationStatus,
      wilaya: 'Alger',
    },
  ];
  const establishments: Row[] = [
    {
      address: '5 avenue de l’ALN, Blida',
      id: 'establishment-1',
      managerFullName: 'Nadia Hamidi',
      name: 'Clinique El Amel',
      ownerId: 'user-clinic',
      phone: '0550000002',
      professionalEmail: 'clinic@example.dz',
      subscriptionStatus: 'NO_PLAN',
      type: 'CLINIC',
      verificationStatus,
      wilaya: 'Blida',
    },
  ];
  const workspaces: Row[] = [
    {
      id: 'ws-doctor',
      name: 'Samir Kaci',
      ownerDoctorProfileId: 'profile-doctor',
    },
    {
      id: 'ws-clinic',
      name: 'Clinique El Amel',
      establishmentId: 'establishment-1',
    },
  ];
  const refreshTokens: Row[] = [];
  const resetTokens: Row[] = [
    {
      expiresAt: new Date(Date.now() + HOUR_MS),
      id: 'reset-1',
      usedAt: null,
      userId: 'user-doctor',
    },
  ];

  const withRelations = (user: Row | undefined) => {
    if (!user) return null;
    const doctor = doctors.find((row) => row.userId === user.id);
    const establishment = establishments.find((row) => row.ownerId === user.id);
    return {
      ...user,
      doctorProfile: doctor
        ? {
            ...doctor,
            establishment: doctor.establishmentId ? { name: 'Clinique' } : null,
          }
        : null,
      establishment: establishment ?? null,
    };
  };
  const updateMany = (rows: Row[], where: Where, data: Row) => {
    const hits = rows.filter((row) => matches(row, where));
    hits.forEach((row) => Object.assign(row, data));
    return Promise.resolve({ count: hits.length });
  };
  const updateOne = (rows: Row[], where: Where, data: Row) => {
    const row = rows.find((candidate) => matches(candidate, where));
    if (!row) throw new Error('unknown row');
    Object.assign(row, data);
    return Promise.resolve(row);
  };

  const prisma = {
    $transaction: jest.fn<Promise<unknown>, [(client: unknown) => unknown]>(),
    doctorProfile: {
      update: jest.fn(({ data, where }: { data: Row; where: Where }) =>
        updateOne(doctors, where, data),
      ),
    },
    establishment: {
      update: jest.fn(({ data, where }: { data: Row; where: Where }) =>
        updateOne(establishments, where, data),
      ),
    },
    passwordResetToken: {
      updateMany: jest.fn(({ data, where }: { data: Row; where: Where }) =>
        updateMany(resetTokens, where, data),
      ),
    },
    refreshToken: {
      findFirst: jest.fn(({ where }: { where: Where }) =>
        Promise.resolve(
          refreshTokens.find((row) => matches(row, where)) ?? null,
        ),
      ),
      findMany: jest.fn(({ where }: { where: Where }) =>
        Promise.resolve(
          refreshTokens
            .filter((row) => matches(row, where))
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
        ),
      ),
      updateMany: jest.fn(({ data, where }: { data: Row; where: Where }) =>
        updateMany(refreshTokens, where, data),
      ),
    },
    user: {
      findUnique: jest.fn(({ where }: { where: Where }) =>
        Promise.resolve(
          withRelations(users.find((row) => matches(row, where))),
        ),
      ),
      update: jest.fn(({ data, where }: { data: Row; where: Where }) =>
        updateOne(users, where, data),
      ),
    },
    workspace: {
      updateMany: jest.fn(
        ({
          data,
          where,
        }: {
          data: Row;
          where: {
            establishment?: { ownerId: string };
            ownerDoctorProfile?: { userId: string };
          };
        }) => {
          const profile = doctors.find(
            (row) => row.userId === where.ownerDoctorProfile?.userId,
          );
          const establishment = establishments.find(
            (row) => row.ownerId === where.establishment?.ownerId,
          );
          return updateMany(
            workspaces,
            profile
              ? { ownerDoctorProfileId: profile.id }
              : { establishmentId: establishment?.id ?? 'none' },
            data,
          );
        },
      ),
    },
  };
  prisma.$transaction.mockImplementation((work) =>
    Promise.resolve(work(prisma)),
  );

  return {
    doctors,
    establishments,
    prisma,
    refreshTokens,
    resetTokens,
    users,
    workspaces,
  };
}

async function addSession(
  database: ReturnType<typeof createDatabase>,
  session: {
    device: string;
    id: string;
    ipAddress?: string | null;
    revokedAt?: Date | null;
    userAgent?: string | null;
    userId?: string;
    expiresAt?: Date;
  },
) {
  database.refreshTokens.push({
    createdAt: new Date(`2026-10-2${database.refreshTokens.length}T10:00:00Z`),
    expiresAt: session.expiresAt ?? new Date(Date.now() + 24 * HOUR_MS),
    id: session.id,
    ipAddress: session.ipAddress ?? '41.200.12.34',
    revokedAt: session.revokedAt ?? null,
    tokenHash: await hashRefreshToken(tokenOf(session.device), 4),
    userAgent: session.userAgent ?? null,
    userId: session.userId ?? 'user-doctor',
  });
}

const CHROME_WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';
const SAFARI_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

async function setup(verificationStatus = 'VERIFIED') {
  const database = createDatabase(verificationStatus);
  const passwordHash = await bcrypt.hash('Ancien-mdp-2026', 4);
  database.users.forEach((user) => {
    user.passwordHash = passwordHash;
  });

  const audits: AuditEntry[] = [];
  const audit = {
    createAuditLog: jest.fn((entry: AuditEntry) => {
      audits.push(entry);
      return Promise.resolve();
    }),
  };
  const mails: MailMessage[] = [];
  const mail = {
    send: jest.fn((message: MailMessage) => {
      mails.push(message);
      return Promise.resolve();
    }),
  };
  const realtime = { disconnectUser: jest.fn(() => Promise.resolve()) };
  const authService = {
    hashPassword: jest.fn((password: string) => bcrypt.hash(password, 4)),
  };
  const prisma = database.prisma as unknown as PrismaService;
  const sessions = new AccountSessionsService(
    prisma,
    audit as unknown as AuditLogsService,
    realtime as unknown as RealtimeService,
  );
  const account = new AccountService(
    prisma,
    authService as unknown as AuthService,
    sessions,
    audit as unknown as AuditLogsService,
    mail as unknown as MailService,
    realtime as unknown as RealtimeService,
  );

  return {
    account,
    audit,
    audits,
    authService,
    database,
    mail,
    mails,
    realtime,
    sessions,
  };
}

const passwordChange = (currentPassword: string, newPassword: string) =>
  plainToInstance(ChangePasswordDto, { currentPassword, newPassword });
const profileChange = (changes: Row) =>
  plainToInstance(UpdateAccountProfileDto, changes);

describe('AccountService.changePassword', () => {
  it('refuses a wrong current password with a dedicated code, then accepts the right one', async () => {
    const { account, audits, database } = await setup();
    const before = database.users[0].passwordHash as string;

    await expect(
      account.changePassword(
        'user-doctor',
        passwordChange('pas-le-bon-mdp', 'Nouveau-mdp-2026'),
        null,
      ),
    ).rejects.toMatchObject({
      response: { code: 'CURRENT_PASSWORD_INVALID' },
      status: 400,
    });
    expect(database.users[0].passwordHash).toBe(before);
    expect(audits.map((entry) => entry.action)).toEqual([
      'PASSWORD_CHANGE_FAILED',
    ]);

    await expect(
      account.changePassword(
        'user-doctor',
        passwordChange('Ancien-mdp-2026', 'Nouveau-mdp-2026'),
        null,
      ),
    ).resolves.toMatchObject({ message: 'Votre mot de passe a été modifié.' });
    expect(
      await bcrypt.compare(
        'Nouveau-mdp-2026',
        database.users[0].passwordHash as string,
      ),
    ).toBe(true);
    expect(audits.map((entry) => entry.action)).toEqual([
      'PASSWORD_CHANGE_FAILED',
      'PASSWORD_CHANGED',
    ]);
  });

  it('hashes the new password with the function of the registration', async () => {
    const { account, authService } = await setup();

    await account.changePassword(
      'user-doctor',
      passwordChange('Ancien-mdp-2026', 'Nouveau-mdp-2026'),
      null,
    );

    expect(authService.hashPassword).toHaveBeenCalledWith('Nouveau-mdp-2026');
  });

  it('closes the other sessions of the account and keeps the current one', async () => {
    const { account, audits, database, mails, realtime } = await setup();
    await addSession(database, { device: 'phone', id: 'session-phone' });
    await addSession(database, { device: 'laptop', id: 'session-laptop' });
    await addSession(database, { device: 'tablet', id: 'session-tablet' });
    await addSession(database, {
      device: 'office',
      id: 'session-someone-else',
      userId: 'user-other',
    });

    const result = await account.changePassword(
      'user-doctor',
      passwordChange('Ancien-mdp-2026', 'Nouveau-mdp-2026'),
      tokenOf('laptop'),
      { ipAddress: '41.200.12.34' },
    );

    const open = (id: string) =>
      database.refreshTokens.find((row) => row.id === id)?.revokedAt === null;
    expect(result.revokedSessions).toBe(2);
    expect(open('session-laptop')).toBe(true);
    expect(open('session-phone')).toBe(false);
    expect(open('session-tablet')).toBe(false);
    // The sessions of another account are not the business of this one.
    expect(open('session-someone-else')).toBe(true);
    expect(audits.at(-1)).toMatchObject({
      action: 'PASSWORD_CHANGED',
      metadata: { keptCurrentSession: true, revokedSessions: 2 },
    });
    expect(realtime.disconnectUser).toHaveBeenCalledWith('user-doctor');
    // A notice, which says that this session stays.
    expect(mails).toHaveLength(1);
    expect(mails[0].to).toBe('doctor@example.dz');
    expect(mails[0].subject).toContain('modifié');
    expect(mails[0].text).toContain('vos autres sessions');
  });

  it('closes a reset link that is still in a mailbox', async () => {
    const { account, database } = await setup();

    await account.changePassword(
      'user-doctor',
      passwordChange('Ancien-mdp-2026', 'Nouveau-mdp-2026'),
      null,
    );

    expect(
      (database.resetTokens[0].expiresAt as Date).getTime(),
    ).toBeLessThanOrEqual(Date.now());
  });

  it('closes every session when the request is tied to none of them', async () => {
    const { account, audits, database, mails } = await setup();
    await addSession(database, { device: 'phone', id: 'session-phone' });
    await addSession(database, { device: 'laptop', id: 'session-laptop' });

    // No cookie, then a cookie that matches no session of the account.
    for (const cookie of [null, tokenOf('unknown-device')]) {
      database.refreshTokens.forEach((row) => {
        row.revokedAt = null;
      });
      const result = await account.changePassword(
        'user-doctor',
        passwordChange('Ancien-mdp-2026', 'Nouveau-mdp-2026'),
        cookie,
      );
      expect(result.revokedSessions).toBe(2);

      database.users[0].passwordHash = await bcrypt.hash('Ancien-mdp-2026', 4);
    }

    expect(audits.at(-1)?.metadata).toEqual({
      keptCurrentSession: false,
      revokedSessions: 2,
    });
    expect(mails.at(-1)?.text).toContain('toutes vos sessions');
  });

  it('refuses a new password equal to the current one', async () => {
    const { account, database } = await setup();
    await addSession(database, { device: 'phone', id: 'session-phone' });

    await expect(
      account.changePassword(
        'user-doctor',
        passwordChange('Ancien-mdp-2026', 'Ancien-mdp-2026'),
        tokenOf('laptop'),
      ),
    ).rejects.toMatchObject({
      response: { code: 'NEW_PASSWORD_SAME_AS_CURRENT' },
      status: 400,
    });
    expect(database.refreshTokens[0].revokedAt).toBeNull();
  });

  it('keeps the change when the notice cannot be sent', async () => {
    const { account, database, mail } = await setup();
    mail.send.mockRejectedValueOnce(new Error('SMTP down'));

    await expect(
      account.changePassword(
        'user-doctor',
        passwordChange('Ancien-mdp-2026', 'Nouveau-mdp-2026'),
        null,
      ),
    ).resolves.toMatchObject({ revokedSessions: 0 });
    expect(
      await bcrypt.compare(
        'Nouveau-mdp-2026',
        database.users[0].passwordHash as string,
      ),
    ).toBe(true);
  });
});

describe('ChangePasswordDto', () => {
  const messagesOf = async (instance: object) =>
    (await validate(instance)).flatMap((error) =>
      Object.values(error.constraints ?? {}),
    );

  it('applies the rule of the reset: the same minimum, the same message', async () => {
    const reset = plainToInstance(ResetPasswordDto, {
      confirmPassword: 'court',
      password: 'court',
      token: 'x',
    });
    const change = plainToInstance(ChangePasswordDto, {
      currentPassword: 'Ancien-mdp-2026',
      newPassword: 'court',
    });

    const resetMessages = await messagesOf(reset);
    const changeMessages = await messagesOf(change);

    expect(resetMessages).toContain(
      'Le mot de passe doit contenir au moins 8 caractères.',
    );
    expect(changeMessages).toEqual([
      'Le mot de passe doit contenir au moins 8 caractères.',
    ]);
  });

  it('trims both passwords and asks for the current one', async () => {
    const valid = plainToInstance(ChangePasswordDto, {
      currentPassword: '  Ancien-mdp-2026 ',
      newPassword: ' Nouveau-mdp-2026  ',
    });
    expect(await validate(valid)).toHaveLength(0);
    expect(valid.currentPassword).toBe('Ancien-mdp-2026');
    expect(valid.newPassword).toBe('Nouveau-mdp-2026');

    const missing = plainToInstance(ChangePasswordDto, {
      newPassword: 'Nouveau-mdp-2026',
    });
    expect(await messagesOf(missing)).toContain(
      'Le mot de passe actuel est obligatoire.',
    );
  });
});

describe('AccountService.updateProfile', () => {
  it('refuses the identity of a doctor once the account is verified', async () => {
    const { account, audits, database } = await setup('VERIFIED');

    await expect(
      account.updateProfile(
        'user-doctor',
        profileChange({
          fullName: 'Autre Nom',
          speciality: 'Pédiatrie',
          wilaya: 'Oran',
        }),
      ),
    ).rejects.toMatchObject({
      response: {
        code: 'PROFILE_FIELD_LOCKED',
        fields: ['fullName', 'speciality', 'wilaya'],
      },
      status: 409,
    });
    expect(database.users[0].fullName).toBe('Samir Kaci');
    expect(database.doctors[0].speciality).toBe('Cardiologie');
    expect(audits).toHaveLength(0);
  });

  it('refuses the identity of an establishment once the account is verified', async () => {
    const { account, database } = await setup('VERIFIED');

    const refusal = await account
      .updateProfile(
        'user-clinic',
        profileChange({
          establishmentName: 'Autre clinique',
          establishmentType: 'HOSPITAL',
          wilaya: 'Oran',
        }),
      )
      .catch((error: unknown) => error as ConflictException);

    expect(refusal).toBeInstanceOf(ConflictException);
    const body = (refusal as ConflictException).getResponse() as {
      code: string;
      fields: string[];
    };
    expect(body.code).toBe('PROFILE_FIELD_LOCKED');
    expect([...body.fields].sort()).toEqual([
      'establishmentName',
      'establishmentType',
      'wilaya',
    ]);
    expect(database.establishments[0].name).toBe('Clinique El Amel');
  });

  it.each(['NOT_STARTED', 'DRAFT', 'PENDING_VERIFICATION', 'REJECTED'])(
    'accepts the same fields while the verification is %s',
    async (status) => {
      const { account, database } = await setup(status);

      const profile = await account.updateProfile(
        'user-doctor',
        profileChange({
          fullName: 'Samir Kaci-Benali',
          speciality: 'Pédiatrie',
          wilaya: 'Oran',
        }),
      );

      expect(profile).toMatchObject({
        fullName: 'Samir Kaci-Benali',
        lockedFields: [],
      });
      expect(profile.doctor).toMatchObject({
        speciality: 'Pédiatrie',
        wilaya: 'Oran',
      });
      // The private practice is named after the doctor.
      expect(database.workspaces[0].name).toBe('Samir Kaci-Benali');
    },
  );

  it('accepts the identity of an establishment before the approval, with its workspace and manager', async () => {
    const { account, database } = await setup('DRAFT');

    const profile = await account.updateProfile(
      'user-clinic',
      profileChange({
        establishmentName: 'Clinique Ibn Sina',
        establishmentType: 'HOSPITAL',
        fullName: 'Nadia Hamidi-Kaci',
      }),
    );

    expect(profile.establishment).toMatchObject({
      managerFullName: 'Nadia Hamidi-Kaci',
      name: 'Clinique Ibn Sina',
      type: 'HOSPITAL',
    });
    expect(database.workspaces[1].name).toBe('Clinique Ibn Sina');
  });

  it('lets a verified account send its locked fields back unchanged', async () => {
    const { account, audits } = await setup('VERIFIED');

    const profile = await account.updateProfile(
      'user-doctor',
      profileChange({
        address: '12 rue Didouche Mourad, Alger',
        fullName: 'Samir Kaci',
        speciality: 'Cardiologie',
        wilaya: 'Alger',
      }),
    );

    expect(profile.lockedFields).toEqual(['fullName', 'speciality', 'wilaya']);
    // Nothing changed, nothing written.
    expect(audits).toHaveLength(0);
  });

  it('always accepts the phone and the address, and a new phone is not verified any more', async () => {
    const { account, audits, database } = await setup('VERIFIED');

    const profile = await account.updateProfile(
      'user-doctor',
      profileChange({
        address: '3 boulevard Krim Belkacem, Alger',
        fullName: 'Samir Kaci',
        phone: '0661 23 45 67',
      }),
      { ipAddress: '41.200.12.34' },
    );

    expect(profile.phone).toBe('0661 23 45 67');
    expect(profile.isPhoneVerified).toBe(false);
    expect(profile.doctor?.address).toBe('3 boulevard Krim Belkacem, Alger');
    expect(database.users[0].fullName).toBe('Samir Kaci');
    // The audit keeps the names of the fields, not their values.
    expect(audits).toEqual([
      expect.objectContaining({
        action: 'ACCOUNT_PROFILE_UPDATED',
        metadata: { fields: ['phone', 'address'] },
      }),
    ]);
    expect(JSON.stringify(audits)).not.toContain('0661');
  });

  it('gives an establishment its new phone and address too', async () => {
    const { account, database } = await setup('VERIFIED');

    const profile = await account.updateProfile(
      'user-clinic',
      profileChange({
        address: '9 rue de la Paix, Blida',
        phone: '0770 11 22 33',
      }),
    );

    expect(profile.phone).toBe('0770 11 22 33');
    expect(profile.establishment).toMatchObject({
      address: '9 rue de la Paix, Blida',
      phone: '0770 11 22 33',
    });
    expect(database.users[1].phone).toBe('0770 11 22 33');
  });

  it('refuses a phone number another account holds, and writes nothing', async () => {
    const { account, audits, database } = await setup('VERIFIED');

    await expect(
      account.updateProfile(
        'user-doctor',
        profileChange({
          address: 'Nouvelle adresse, Alger',
          phone: '0550000003',
        }),
      ),
    ).rejects.toMatchObject({
      response: { code: 'PHONE_ALREADY_USED' },
      status: 409,
    });
    expect(database.users[0].phone).toBe('0550000001');
    expect(database.doctors[0].professionalAddress).toBe(
      '12 rue Didouche Mourad, Alger',
    );
    expect(audits).toHaveLength(0);
  });

  it('does not take the number of the account itself for a number that is taken', async () => {
    const { account } = await setup('VERIFIED');

    await expect(
      account.updateProfile(
        'user-doctor',
        profileChange({ phone: '0550000001' }),
      ),
    ).resolves.toMatchObject({ isPhoneVerified: true, phone: '0550000001' });
  });

  it('refuses a field the type of account does not have', async () => {
    const { account } = await setup('DRAFT');

    await expect(
      account.updateProfile(
        'user-clinic',
        profileChange({ speciality: 'Cardiologie' }),
      ),
    ).rejects.toMatchObject({
      response: {
        code: 'PROFILE_FIELD_NOT_APPLICABLE',
        fields: ['speciality'],
      },
      status: 400,
    });
    await expect(
      account.updateProfile(
        'user-doctor',
        profileChange({ establishmentName: 'Clinique' }),
      ),
    ).rejects.toMatchObject({
      response: { code: 'PROFILE_FIELD_NOT_APPLICABLE' },
      status: 400,
    });
  });

  it('returns the profile with the e-mail read-only and the locked fields named', async () => {
    const { account } = await setup('VERIFIED');

    const doctor = await account.getProfile('user-doctor');
    const clinic = await account.getProfile('user-clinic');

    expect(doctor).toMatchObject({
      email: 'doctor@example.dz',
      kind: 'DOCTOR',
      lockedFields: ['fullName', 'speciality', 'wilaya'],
      verificationStatus: 'VERIFIED',
    });
    expect(clinic).toMatchObject({
      kind: 'ESTABLISHMENT',
      lockedFields: [
        'fullName',
        'establishmentName',
        'establishmentType',
        'wilaya',
      ],
    });
    expect(doctor).not.toHaveProperty('passwordHash');
  });
});

describe('UpdateAccountProfileDto', () => {
  it('has no e-mail: it is the login', async () => {
    const dto = plainToInstance(UpdateAccountProfileDto, {
      email: 'x@example.dz',
    });
    const errors = await validate(dto, {
      forbidNonWhitelisted: true,
      whitelist: true,
    });

    expect(errors.map((error) => error.property)).toEqual(['email']);
  });

  it('checks the phone like the registration does', async () => {
    const wrong = plainToInstance(UpdateAccountProfileDto, {
      phone: 'pas un numéro',
    });
    expect(await validate(wrong)).not.toHaveLength(0);

    const right = plainToInstance(UpdateAccountProfileDto, {
      phone: ' +213 550 00 00 01 ',
    });
    expect(await validate(right)).toHaveLength(0);
    expect(right.phone).toBe('+213 550 00 00 01');
  });
});

describe('AccountSessionsService', () => {
  it('lists the active sessions only, readable, the current one marked', async () => {
    const { database, sessions } = await setup();
    await addSession(database, {
      device: 'laptop',
      id: 'session-laptop',
      ipAddress: '41.200.12.34',
      userAgent: CHROME_WINDOWS,
    });
    await addSession(database, {
      device: 'phone',
      id: 'session-phone',
      ipAddress: '105.101.7.9',
      userAgent: SAFARI_IPHONE,
    });
    await addSession(database, {
      device: 'old',
      id: 'session-revoked',
      revokedAt: new Date(),
    });
    await addSession(database, {
      device: 'older',
      expiresAt: new Date(Date.now() - HOUR_MS),
      id: 'session-expired',
    });
    await addSession(database, {
      device: 'office',
      id: 'session-someone-else',
      userId: 'user-other',
    });

    const list = await sessions.list('user-doctor', tokenOf('laptop'));

    expect(list.map((session) => session.id)).toEqual([
      'session-phone',
      'session-laptop',
    ]);
    expect(list).toEqual([
      expect.objectContaining({
        browser: 'Safari',
        current: false,
        ipAddress: '105.101.x.x',
        os: 'iOS',
      }),
      expect.objectContaining({
        browser: 'Chrome',
        current: true,
        ipAddress: '41.200.x.x',
        os: 'Windows',
      }),
    ]);
    expect(JSON.stringify(list)).not.toMatch(/tokenHash|41\.200\.12/);
  });

  it('marks no session as the current one without a refresh token', async () => {
    const { database, sessions } = await setup();
    await addSession(database, { device: 'laptop', id: 'session-laptop' });

    const list = await sessions.list('user-doctor', null);

    expect(list.map((session) => session.current)).toEqual([false]);
  });

  it('cannot revoke the session of another user: not found, and still open', async () => {
    const { audits, database, realtime, sessions } = await setup();
    await addSession(database, {
      device: 'office',
      id: 'session-someone-else',
      userId: 'user-other',
    });

    await expect(
      sessions.revoke('user-doctor', 'session-someone-else', tokenOf('laptop')),
    ).rejects.toMatchObject({
      response: { code: 'SESSION_NOT_FOUND' },
      status: 404,
    });
    // The answer for an id that does not exist is the same.
    await expect(
      sessions.revoke('user-doctor', 'no-such-session', null),
    ).rejects.toMatchObject({
      response: { code: 'SESSION_NOT_FOUND' },
      status: 404,
    });

    expect(database.refreshTokens[0].revokedAt).toBeNull();
    expect(audits).toHaveLength(0);
    expect(realtime.disconnectUser).not.toHaveBeenCalled();
  });

  it('revokes a session of the caller, with an audit entry and its sockets closed', async () => {
    const { audits, database, realtime, sessions } = await setup();
    await addSession(database, { device: 'laptop', id: 'session-laptop' });
    await addSession(database, { device: 'phone', id: 'session-phone' });

    await expect(
      sessions.revoke('user-doctor', 'session-phone', tokenOf('laptop')),
    ).resolves.toEqual({ revoked: 1 });

    expect(database.refreshTokens[1].revokedAt).toBeInstanceOf(Date);
    expect(database.refreshTokens[0].revokedAt).toBeNull();
    expect(audits).toEqual([
      expect.objectContaining({
        action: 'SESSION_REVOKED',
        entityId: 'session-phone',
      }),
    ]);
    expect(realtime.disconnectUser).toHaveBeenCalledWith('user-doctor');
  });

  it('does not revoke the current session: that is the logout', async () => {
    const { database, sessions } = await setup();
    await addSession(database, { device: 'laptop', id: 'session-laptop' });
    await addSession(database, { device: 'phone', id: 'session-phone' });

    await expect(
      sessions.revoke('user-doctor', 'session-laptop', tokenOf('laptop')),
    ).rejects.toMatchObject({
      response: { code: 'CURRENT_SESSION' },
      status: 400,
    });
    expect(database.refreshTokens[0].revokedAt).toBeNull();
  });

  it('closes all the other sessions and keeps the current one', async () => {
    const { audits, database, realtime, sessions } = await setup();
    await addSession(database, { device: 'phone', id: 'session-phone' });
    await addSession(database, { device: 'laptop', id: 'session-laptop' });
    await addSession(database, { device: 'tablet', id: 'session-tablet' });
    await addSession(database, {
      device: 'office',
      id: 'session-someone-else',
      userId: 'user-other',
    });

    await expect(
      sessions.revokeOthers('user-doctor', tokenOf('laptop')),
    ).resolves.toEqual({ revoked: 2 });

    const open = (id: string) =>
      database.refreshTokens.find((row) => row.id === id)?.revokedAt === null;
    expect(open('session-laptop')).toBe(true);
    expect(open('session-phone')).toBe(false);
    expect(open('session-tablet')).toBe(false);
    expect(open('session-someone-else')).toBe(true);
    expect(audits).toEqual([
      expect.objectContaining({
        action: 'SESSIONS_REVOKED',
        metadata: { revokedSessions: 2 },
      }),
    ]);
    expect(realtime.disconnectUser).toHaveBeenCalledWith('user-doctor');
  });

  it('closes nothing when the current session cannot be told', async () => {
    const { database, sessions } = await setup();
    await addSession(database, { device: 'phone', id: 'session-phone' });
    await addSession(database, { device: 'laptop', id: 'session-laptop' });

    for (const cookie of [null, tokenOf('unknown-device')]) {
      await expect(
        sessions.revokeOthers('user-doctor', cookie),
      ).rejects.toMatchObject({
        response: { code: 'CURRENT_SESSION_UNKNOWN' },
        status: 400,
      });
    }
    expect(database.refreshTokens.map((row) => row.revokedAt)).toEqual([
      null,
      null,
    ]);
  });

  it('tells apart sessions whose refresh tokens start alike', async () => {
    const { database, sessions } = await setup();
    await addSession(database, { device: 'a', id: 'session-a' });
    await addSession(database, { device: 'b', id: 'session-b' });

    expect(
      await sessions.findCurrentSessionId('user-doctor', tokenOf('a')),
    ).toBe('session-a');
    expect(
      await sessions.findCurrentSessionId('user-doctor', tokenOf('b')),
    ).toBe('session-b');
  });
});

describe('AccountController', () => {
  const handler = (name: keyof AccountController) =>
    AccountController.prototype[name] as (...args: never[]) => unknown;
  const metadata = (key: string, target: object) =>
    Reflect.getMetadata(key, target) as unknown;

  it('needs a signed-in user of the application, not a verified account', () => {
    expect(metadata(GUARDS_METADATA, AccountController)).toEqual([
      JwtAuthGuard,
      RolesGuard,
    ]);
    expect(metadata(ROLES_KEY, AccountController)).toEqual([
      'ESTABLISHMENT_ADMIN',
      'INDEPENDENT_DOCTOR',
      'AFFILIATED_DOCTOR',
    ]);
  });

  it('limits the password change like the login: 5 a minute per IP', () => {
    const changePassword = handler('changePassword');

    expect(metadata('THROTTLER:LIMITdefault', changePassword)).toBe(5);
    expect(metadata('THROTTLER:TTLdefault', changePassword)).toBe(60_000);
    expect(metadata('THROTTLER:TRACKERdefault', changePassword)).toBe(
      trackByIp,
    );
  });
});
