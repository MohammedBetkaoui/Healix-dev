import { BadRequestException, Logger } from '@nestjs/common';
import { type ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { createHash } from 'node:crypto';

import { type AuditLogsService } from '../../audit-logs/audit-logs.service';
import { MailConfigError, readMailConfig } from '../../mail/mail.config';
import { type MailMessage, MailService } from '../../mail/mail.service';
import {
  passwordChangedEmail,
  passwordResetRequestEmail,
} from '../../mail/templates/password-reset.templates';
import { type PrismaService } from '../../prisma/prisma.service';
import { type AuthService } from '../auth.service';
import { RegisterIndependentDoctorDto } from '../dto/register-independent-doctor.dto';
import { PasswordResetCleanupScheduler } from './password-reset-cleanup.scheduler';
import { ForgotPasswordDto, ResetPasswordDto } from './password-reset.dto';
import {
  FORGOT_PASSWORD_MESSAGE,
  FORGOT_PASSWORD_MIN_RESPONSE_MS,
  hashResetToken,
  PASSWORD_RESET_DONE_MESSAGE,
  PasswordResetService,
  RESET_TOKEN_INVALID_MESSAGE,
} from './password-reset.service';

type UserRow = {
  accountStatus: string;
  email: string;
  fullName: string;
  id: string;
  passwordHash: string;
  role: string;
};
type TokenRow = {
  createdAt: Date;
  expiresAt: Date;
  id: string;
  requestIp: string | null;
  tokenHash: string;
  usedAt: Date | null;
  userId: string;
};
type RefreshRow = { id: string; revokedAt: Date | null; userId: string };
type Where = Record<string, unknown>;
type AuditEntry = {
  action: string;
  ipAddress?: string | null;
  metadata: Record<string, unknown>;
  userId?: string | null;
};

// Applies the where clauses the service sends, so that a missing condition
// shows up as a wrong result. Anything it does not know fails the test.
function matches(row: Record<string, unknown>, where: Where): boolean {
  return Object.entries(where).every(([key, condition]) => {
    const value = row[key];

    if (condition === null) return value === null;
    if (condition instanceof Date || typeof condition !== 'object') {
      return value === condition;
    }

    return Object.entries(condition as Record<string, Date>).every(
      ([operator, bound]) => {
        const time = (value as Date).getTime();
        if (operator === 'gt') return time > bound.getTime();
        if (operator === 'gte') return time >= bound.getTime();
        if (operator === 'lt') return time < bound.getTime();
        throw new Error(`Unsupported operator ${operator}`);
      },
    );
  });
}

function pick(row: UserRow, select: Record<string, boolean>) {
  return Object.fromEntries(
    Object.keys(select).map((key) => [key, row[key as keyof UserRow]]),
  );
}

function createDatabase() {
  const users: UserRow[] = [];
  const tokens: TokenRow[] = [];
  const refreshTokens: RefreshRow[] = [];
  let sequence = 0;

  const updateMany = <Row extends Record<string, unknown>>(
    rows: Row[],
    where: Where,
    data: Partial<Row>,
  ) => {
    const hits = rows.filter((row) => matches(row, where));
    hits.forEach((row) => Object.assign(row, data));
    return { count: hits.length };
  };

  const prisma = {
    user: {
      findUnique: jest.fn(
        ({
          select,
          where,
        }: {
          select: Record<string, boolean>;
          where: { email: string };
        }) => {
          const user = users.find((row) => row.email === where.email);
          return Promise.resolve(user ? pick(user, select) : null);
        },
      ),
      update: jest.fn(
        ({
          data,
          where,
        }: {
          data: Partial<UserRow>;
          where: { id: string };
        }) => {
          const user = users.find((row) => row.id === where.id);
          if (!user) throw new Error('unknown user');
          Object.assign(user, data);
          return Promise.resolve(user);
        },
      ),
    },
    passwordResetToken: {
      count: jest.fn(({ where }: { where: Where }) =>
        Promise.resolve(tokens.filter((row) => matches(row, where)).length),
      ),
      create: jest.fn(
        ({ data }: { data: Omit<TokenRow, 'createdAt' | 'id' | 'usedAt'> }) => {
          const row: TokenRow = {
            ...data,
            createdAt: new Date(),
            id: `token-${++sequence}`,
            usedAt: null,
          };
          tokens.push(row);
          return Promise.resolve(row);
        },
      ),
      deleteMany: jest.fn(({ where }: { where: Where }) => {
        const kept = tokens.filter((row) => !matches(row, where));
        const count = tokens.length - kept.length;
        tokens.splice(0, tokens.length, ...kept);
        return Promise.resolve({ count });
      }),
      findUnique: jest.fn(
        ({ where }: { include: unknown; where: { tokenHash: string } }) => {
          const row = tokens.find(
            (token) => token.tokenHash === where.tokenHash,
          );
          if (!row) return Promise.resolve(null);
          const user = users.find((candidate) => candidate.id === row.userId)!;
          return Promise.resolve({ ...row, user: { ...user } });
        },
      ),
      updateMany: jest.fn(
        ({ data, where }: { data: Partial<TokenRow>; where: Where }) =>
          Promise.resolve(updateMany(tokens, where, data)),
      ),
    },
    refreshToken: {
      updateMany: jest.fn(
        ({ data, where }: { data: Partial<RefreshRow>; where: Where }) =>
          Promise.resolve(updateMany(refreshTokens, where, data)),
      ),
    },
    $transaction: jest.fn<
      Promise<unknown>,
      [(client: unknown) => Promise<unknown>]
    >(),
  };
  prisma.$transaction.mockImplementation((work) => work(prisma));

  return { prisma, refreshTokens, tokens, users };
}

// The 500 ms floor is measured in its own test; elsewhere it is skipped.
class InstantPasswordResetService extends PasswordResetService {
  protected override waitUntil(): Promise<void> {
    return Promise.resolve();
  }
}

function setup(
  ServiceClass: typeof PasswordResetService = InstantPasswordResetService,
) {
  const database = createDatabase();
  const audits: AuditEntry[] = [];
  const audit = {
    createAuditLog: jest.fn((entry: AuditEntry) => {
      audits.push(entry);
      return Promise.resolve();
    }),
  };
  const sent: MailMessage[] = [];
  const mail = {
    publicUrl: 'https://app.healix.test',
    send: jest.fn((message: MailMessage) => {
      sent.push(message);
      return Promise.resolve();
    }),
  };
  const auth = { hashPassword: (password: string) => bcrypt.hash(password, 4) };
  const service = new ServiceClass(
    database.prisma as unknown as PrismaService,
    auth as unknown as AuthService,
    audit as unknown as AuditLogsService,
    mail as unknown as MailService,
  );

  const addUser = (user: Partial<UserRow> & { email: string; id: string }) => {
    const row: UserRow = {
      accountStatus: 'ACTIVE',
      fullName: 'Amina Benali',
      passwordHash: 'old-hash',
      role: 'INDEPENDENT_DOCTOR',
      ...user,
    };
    database.users.push(row);
    return row;
  };

  // The token only exists in the e-mail: read it back from the link.
  const tokenFromMail = (index = sent.length - 1) => {
    const match = /reset-password\?token=([A-Za-z0-9_-]+)/.exec(
      sent[index].text,
    );
    if (!match) throw new Error('no link in the e-mail');
    return match[1];
  };

  return { ...database, addUser, audits, mail, sent, service, tokenFromMail };
}

const context = { ipAddress: '203.0.113.7', userAgent: 'jest' };
const NEW_PASSWORD = 'Nouveau-mot-2026';

async function resetError(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof BadRequestException) return error.getResponse();
    throw error;
  }
  throw new Error('the reset was accepted');
}

describe('POST /auth/forgot-password', () => {
  it('answers the same, after the same minimum time, for an unknown e-mail, a suspended account and a valid one', async () => {
    const { addUser, audits, sent, service } = setup(PasswordResetService);
    addUser({ email: 'valid@healix.test', id: 'valid' });
    addUser({
      accountStatus: 'SUSPENDED',
      email: 'suspended@healix.test',
      id: 'suspended',
    });

    const answers: unknown[] = [];
    for (const email of [
      'nobody@healix.test',
      'suspended@healix.test',
      'valid@healix.test',
    ]) {
      const startedAt = Date.now();
      answers.push(await service.requestReset(email, context));
      // Timers may fire a millisecond early.
      expect(Date.now() - startedAt).toBeGreaterThanOrEqual(
        FORGOT_PASSWORD_MIN_RESPONSE_MS - 5,
      );
    }

    expect(answers[0]).toEqual({ message: FORGOT_PASSWORD_MESSAGE });
    expect(answers[1]).toEqual(answers[0]);
    expect(answers[2]).toEqual(answers[0]);
    // Only the valid account gets an e-mail.
    expect(sent.map((message) => message.to)).toEqual(['valid@healix.test']);
    expect(audits.map((log) => [log.action, log.metadata.outcome])).toEqual([
      ['PASSWORD_RESET_REQUESTED', 'UNKNOWN_ACCOUNT'],
      ['PASSWORD_RESET_REQUESTED', 'ACCOUNT_NOT_ELIGIBLE'],
      ['PASSWORD_RESET_REQUESTED', 'EMAIL_SENT'],
    ]);
  });

  it('never sends a link to a back-office admin or a rejected account', async () => {
    const { addUser, sent, service } = setup();
    addUser({ email: 'admin@healix.test', id: 'admin', role: 'SUPER_ADMIN' });
    addUser({
      email: 'checker@healix.test',
      id: 'checker',
      role: 'ADMIN_VERIFICATION',
    });
    addUser({
      accountStatus: 'REJECTED',
      email: 'rejected@healix.test',
      id: 'rejected',
    });

    for (const email of [
      'admin@healix.test',
      'checker@healix.test',
      'rejected@healix.test',
    ]) {
      await expect(service.requestReset(email, context)).resolves.toEqual({
        message: FORGOT_PASSWORD_MESSAGE,
      });
    }

    expect(sent).toEqual([]);
  });

  it('serves every self-service account type', async () => {
    const { addUser, sent, service } = setup();
    addUser({
      email: 'clinic@healix.test',
      id: 'clinic',
      role: 'ESTABLISHMENT_ADMIN',
    });
    addUser({
      email: 'doctor@healix.test',
      id: 'doctor',
      role: 'INDEPENDENT_DOCTOR',
    });
    addUser({
      email: 'staff@healix.test',
      id: 'staff',
      role: 'AFFILIATED_DOCTOR',
    });

    for (const email of [
      'clinic@healix.test',
      'doctor@healix.test',
      'staff@healix.test',
    ]) {
      await service.requestReset(email, context);
    }

    expect(sent.map((message) => message.to)).toEqual([
      'clinic@healix.test',
      'doctor@healix.test',
      'staff@healix.test',
    ]);
  });

  it('stores only the SHA-256 of a 32-byte token, valid 30 minutes, with the IP', async () => {
    const { addUser, audits, sent, service, tokenFromMail, tokens } = setup();
    addUser({ email: 'valid@healix.test', id: 'valid' });

    const before = Date.now();
    await service.requestReset('valid@healix.test', context);
    const token = tokenFromMail();

    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
    expect(sent[0].text).toContain(
      `https://app.healix.test/reset-password?token=${token}`,
    );
    expect(tokens).toHaveLength(1);
    expect(tokens[0].tokenHash).toBe(
      createHash('sha256').update(token).digest('hex'),
    );
    expect(tokens[0].tokenHash).not.toContain(token);
    expect(tokens[0].requestIp).toBe('203.0.113.7');
    const lifetime = tokens[0].expiresAt.getTime() - before;
    expect(lifetime).toBeGreaterThanOrEqual(30 * 60_000);
    expect(lifetime).toBeLessThan(30 * 60_000 + 5_000);
    // Neither the token nor its hash reaches the audit log.
    const logged = JSON.stringify(audits);
    expect(logged).not.toContain(token);
    expect(logged).not.toContain(tokens[0].tokenHash);
    expect(logged).toContain('203.0.113.7');
  });

  it('invalidates the previous unused links of the account', async () => {
    const { addUser, service, tokenFromMail } = setup();
    addUser({ email: 'valid@healix.test', id: 'valid' });

    await service.requestReset('valid@healix.test', context);
    const firstToken = tokenFromMail();
    await service.requestReset('valid@healix.test', context);
    const secondToken = tokenFromMail();

    expect(secondToken).not.toBe(firstToken);
    await expect(
      resetError(
        service.resetPassword(
          { password: NEW_PASSWORD, token: firstToken },
          context,
        ),
      ),
    ).resolves.toEqual({
      code: 'RESET_TOKEN_INVALID',
      message: RESET_TOKEN_INVALID_MESSAGE,
    });
    await expect(
      service.resetPassword(
        { password: NEW_PASSWORD, token: secondToken },
        context,
      ),
    ).resolves.toEqual({ message: PASSWORD_RESET_DONE_MESSAGE });
  });

  it('sends at most 3 e-mails per account and per hour, with the same answer', async () => {
    const { addUser, audits, sent, service, tokens } = setup();
    addUser({ email: 'valid@healix.test', id: 'valid' });

    for (let attempt = 0; attempt < 4; attempt += 1) {
      await expect(
        service.requestReset('valid@healix.test', context),
      ).resolves.toEqual({
        message: FORGOT_PASSWORD_MESSAGE,
      });
    }

    expect(sent).toHaveLength(3);
    expect(tokens).toHaveLength(3);
    expect(audits.at(-1)?.metadata).toEqual({
      outcome: 'ACCOUNT_LIMIT_REACHED',
    });

    // An hour later, the account may ask again.
    tokens.forEach((token) => {
      token.createdAt = new Date(Date.now() - 61 * 60_000);
    });
    await service.requestReset('valid@healix.test', context);
    expect(sent).toHaveLength(4);
  });

  it('gives the same answer when something fails inside', async () => {
    const { addUser, prisma, sent, service } = setup();
    addUser({ email: 'valid@healix.test', id: 'valid' });
    prisma.passwordResetToken.count.mockRejectedValueOnce(
      new Error('database down'),
    );
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    await expect(
      service.requestReset('valid@healix.test', context),
    ).resolves.toEqual({
      message: FORGOT_PASSWORD_MESSAGE,
    });
    expect(sent).toEqual([]);
    jest.restoreAllMocks();
  });
});

describe('POST /auth/reset-password', () => {
  async function requested() {
    const harness = setup();
    const user = harness.addUser({ email: 'valid@healix.test', id: 'valid' });
    harness.addUser({ email: 'other@healix.test', id: 'other' });
    harness.refreshTokens.push(
      { id: 'r1', revokedAt: null, userId: 'valid' },
      { id: 'r2', revokedAt: null, userId: 'valid' },
      { id: 'r3', revokedAt: null, userId: 'other' },
    );
    await harness.service.requestReset('valid@healix.test', context);
    return { ...harness, token: harness.tokenFromMail(), user };
  }

  it('changes the password, hashed like at registration, and closes every session', async () => {
    const { audits, refreshTokens, sent, service, token, tokens, user } =
      await requested();

    await expect(
      service.resetPassword({ password: NEW_PASSWORD, token }, context),
    ).resolves.toEqual({ message: PASSWORD_RESET_DONE_MESSAGE });

    await expect(bcrypt.compare(NEW_PASSWORD, user.passwordHash)).resolves.toBe(
      true,
    );
    expect(tokens[0].usedAt).toBeInstanceOf(Date);
    // Every refresh token of the account is revoked, and only those.
    expect(
      refreshTokens.map((row) => [row.id, row.revokedAt !== null]),
    ).toEqual([
      ['r1', true],
      ['r2', true],
      ['r3', false],
    ]);
    const completed = audits.at(-1);
    expect(completed).toMatchObject({
      action: 'PASSWORD_RESET_COMPLETED',
      ipAddress: '203.0.113.7',
      metadata: { revokedSessions: 2 },
      userId: 'valid',
    });
    expect(JSON.stringify(completed)).not.toContain(token);
    // Confirmation e-mail.
    expect(sent.at(-1)).toMatchObject({
      subject: 'Votre mot de passe HealixDz a été modifié',
      to: 'valid@healix.test',
    });
    expect(sent.at(-1)?.text).toContain(
      "contactez sans attendre l'administration",
    );
  });

  it('accepts a token only once', async () => {
    const { service, token } = await requested();

    await service.resetPassword({ password: NEW_PASSWORD, token }, context);

    await expect(
      resetError(
        service.resetPassword({ password: 'Autre-mot-2026', token }, context),
      ),
    ).resolves.toEqual({
      code: 'RESET_TOKEN_INVALID',
      message: RESET_TOKEN_INVALID_MESSAGE,
    });
  });

  it('refuses an expired token', async () => {
    const { service, token, tokens, user } = await requested();
    tokens[0].expiresAt = new Date(Date.now() - 1_000);

    await expect(
      resetError(
        service.resetPassword({ password: NEW_PASSWORD, token }, context),
      ),
    ).resolves.toEqual({
      code: 'RESET_TOKEN_INVALID',
      message: RESET_TOKEN_INVALID_MESSAGE,
    });
    expect(user.passwordHash).toBe('old-hash');
  });

  it('answers the same for a malformed, unknown, used or expired token, or a suspended account', async () => {
    const { service, token, tokens, user } = await requested();
    const unknown = Buffer.alloc(32, 7).toString('base64url');
    const answers = [
      await resetError(
        service.resetPassword({ password: NEW_PASSWORD, token: '' }, context),
      ),
      await resetError(
        service.resetPassword(
          { password: NEW_PASSWORD, token: 'abc' },
          context,
        ),
      ),
      await resetError(
        service.resetPassword(
          { password: NEW_PASSWORD, token: unknown },
          context,
        ),
      ),
    ];
    user.accountStatus = 'SUSPENDED';
    answers.push(
      await resetError(
        service.resetPassword({ password: NEW_PASSWORD, token }, context),
      ),
    );
    user.accountStatus = 'ACTIVE';
    tokens[0].usedAt = new Date();
    answers.push(
      await resetError(
        service.resetPassword({ password: NEW_PASSWORD, token }, context),
      ),
    );

    for (const answer of answers) {
      expect(answer).toEqual({
        code: 'RESET_TOKEN_INVALID',
        message: RESET_TOKEN_INVALID_MESSAGE,
      });
    }
    expect(user.passwordHash).toBe('old-hash');
  });

  it('keeps the new password when the confirmation e-mail fails', async () => {
    const { mail, service, token, user } = await requested();
    mail.send.mockRejectedValueOnce(new Error('smtp down'));
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    await service.resetPassword({ password: NEW_PASSWORD, token }, context);

    await expect(bcrypt.compare(NEW_PASSWORD, user.passwordHash)).resolves.toBe(
      true,
    );
    jest.restoreAllMocks();
  });
});

describe('reset password validation', () => {
  const errorsOf = async (body: Record<string, unknown>) => {
    const errors = await validate(plainToInstance(ResetPasswordDto, body));
    return Object.fromEntries(
      errors.map((error) => [
        error.property,
        Object.values(error.constraints ?? {}),
      ]),
    );
  };

  it('refuses a too weak password with the registration rule', async () => {
    const token = Buffer.alloc(32, 1).toString('base64url');

    await expect(
      errorsOf({ confirmPassword: 'court', password: 'court', token }),
    ).resolves.toEqual({
      password: ['Le mot de passe doit contenir au moins 8 caractères.'],
    });
    // Trimmed first, as at registration.
    await expect(
      errorsOf({
        confirmPassword: '  1234567  ',
        password: '  1234567  ',
        token,
      }),
    ).resolves.toHaveProperty('password');
    await expect(
      errorsOf({
        confirmPassword: 'Autre-mot-2026',
        password: NEW_PASSWORD,
        token,
      }),
    ).resolves.toEqual({
      confirmPassword: ['Les mots de passe ne correspondent pas.'],
    });
    await expect(
      errorsOf({
        confirmPassword: NEW_PASSWORD,
        password: NEW_PASSWORD,
        token,
      }),
    ).resolves.toEqual({});
  });

  it('applies exactly the rule of the registration form', async () => {
    const registration = {
      acceptTerms: true,
      acceptVerification: true,
      email: 'doc@healix.test',
      fullName: 'Amina Benali',
      phone: '0555 12 34 56',
      professionalAddress: '12 rue des Oliviers, Alger',
      speciality: 'Neurologie',
      wilaya: 'Alger',
    };

    for (const password of ['1234567', '12345678', '   abcdefg   ']) {
      const reset = await validate(
        plainToInstance(ResetPasswordDto, {
          confirmPassword: password,
          password,
          token: 'x',
        }),
      );
      const register = await validate(
        plainToInstance(RegisterIndependentDoctorDto, {
          ...registration,
          confirmPassword: password,
          password,
        }),
      );
      expect(reset.some((error) => error.property === 'password')).toBe(
        register.some((error) => error.property === 'password'),
      );
    }
  });

  it('normalizes the e-mail of a request', async () => {
    const dto = plainToInstance(ForgotPasswordDto, {
      email: '  Valid@Healix.TEST ',
    });
    await expect(validate(dto)).resolves.toEqual([]);
    expect(dto.email).toBe('valid@healix.test');
  });
});

describe('expired token cleanup', () => {
  it('deletes the tokens expired for more than 7 days, and only those', async () => {
    const { prisma, service, tokens } = setup();
    const now = new Date('2026-10-10T03:00:00Z');
    const day = 24 * 60 * 60_000;
    const row = (
      id: string,
      expiresAt: Date,
      usedAt: Date | null = null,
    ): TokenRow => ({
      createdAt: new Date(expiresAt.getTime() - 30 * 60_000),
      expiresAt,
      id,
      requestIp: null,
      tokenHash: hashResetToken(id),
      usedAt,
      userId: 'valid',
    });
    tokens.push(
      row('old-unused', new Date(now.getTime() - 8 * day)),
      row(
        'old-used',
        new Date(now.getTime() - 8 * day),
        new Date(now.getTime() - 8 * day),
      ),
      row('recent', new Date(now.getTime() - 6 * day)),
      row('live', new Date(now.getTime() + 10 * 60_000)),
    );

    await expect(service.purgeExpiredTokens(now)).resolves.toBe(2);
    expect(tokens.map((token) => token.id)).toEqual(['recent', 'live']);
    expect(prisma.passwordResetToken.deleteMany).toHaveBeenCalledTimes(1);
  });

  it('runs daily and never rejects', async () => {
    const purgeExpiredTokens = jest
      .fn()
      .mockRejectedValue(new Error('database down'));
    const errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const scheduler = new PasswordResetCleanupScheduler({
      purgeExpiredTokens,
    } as unknown as PasswordResetService);

    await expect(scheduler.purgeExpiredTokens()).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith(
      'Password reset token cleanup failed.',
      expect.stringContaining('database down'),
    );
    jest.restoreAllMocks();
  });
});

describe('mail without SMTP', () => {
  const configOf = (env: Record<string, string>) =>
    ({ get: (key: string) => env[key] }) as unknown as ConfigService;

  afterEach(() => jest.restoreAllMocks());

  it('writes the e-mail, link included, to the logs in development, with a warning', async () => {
    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const log = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    const service = new MailService(configOf({ NODE_ENV: 'development' }));
    const link = 'http://localhost:3000/reset-password?token=abc';

    await service.send({
      ...passwordResetRequestEmail({
        expiresInMinutes: 30,
        fullName: 'Amina',
        resetUrl: link,
      }),
      to: 'valid@healix.test',
    });

    expect(warn.mock.calls.flat().join('\n')).toMatch(
      /SMTP non configuré.*NON envoyé/s,
    );
    expect(log.mock.calls.flat().join('\n')).toContain(link);
    expect(service.publicUrl).toBe('http://localhost:3000');
  });

  it('refuses to start in production without SMTP', () => {
    expect(() => new MailService(configOf({ NODE_ENV: 'production' }))).toThrow(
      MailConfigError,
    );
    expect(() =>
      readMailConfig({
        APP_PUBLIC_URL: 'https://app.healix.dz',
        MAIL_FROM: 'HealixDz <no-reply@healix.dz>',
        NODE_ENV: 'production',
      }),
    ).toThrow(/SMTP_HOST/);
  });

  it('reads a complete production setup', () => {
    expect(
      readMailConfig({
        APP_PUBLIC_URL: 'https://app.healix.dz/',
        MAIL_FROM: 'HealixDz <no-reply@healix.dz>',
        NODE_ENV: 'production',
        SMTP_HOST: 'smtp.healix.dz',
        SMTP_PASSWORD: 'secret',
        SMTP_PORT: '465',
        SMTP_SECURE: 'true',
        SMTP_USER: 'mailer',
      }),
    ).toEqual({
      from: 'HealixDz <no-reply@healix.dz>',
      publicUrl: 'https://app.healix.dz',
      smtp: {
        auth: { pass: 'secret', user: 'mailer' },
        host: 'smtp.healix.dz',
        port: 465,
        secure: true,
      },
    });
  });
});

describe('password reset e-mails', () => {
  it('carry no remote image and no link other than the reset link', () => {
    const link = 'https://app.healix.dz/reset-password?token=abc_DEF-123';
    const request = passwordResetRequestEmail({
      expiresInMinutes: 30,
      fullName: 'Amina <b>',
      resetUrl: link,
    });
    const changed = passwordChangedEmail({
      changedAt: new Date('2026-10-10T13:30:00Z'),
      fullName: 'Amina',
    });

    for (const email of [request, changed]) {
      expect(email.html).not.toMatch(/<img|url\(|<script/i);
    }
    expect(request.html.match(/https?:\/\/[^\s"<]+/g)).toEqual([link, link]);
    expect(changed.html).not.toMatch(/https?:\/\//);
    expect(request.html).toContain('Amina &lt;b&gt;');
    expect(request.text).toContain('valable 30 minutes');
    expect(changed.text).toContain('10 octobre 2026 à 14:30');
  });
});
