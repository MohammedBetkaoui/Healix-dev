import { type HttpException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';

import { type AuditLogsService } from '../audit-logs/audit-logs.service';
import { type AuthenticatedUserPayload } from '../auth/types/authenticated-request.type';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import { VerifiedAccountGuard } from '../common/guards/verified-account.guard';
import { type PrismaService } from '../prisma/prisma.service';
import { DirectoryController } from './directory.controller';
import { DIRECTORY_LIMIT, DirectoryService } from './directory.service';
import {
  type MessagingUsersService,
  reachableUserWhere,
} from './messaging-users.service';

const ME = 'user-me';
const context = { ipAddress: '203.0.113.7', userAgent: 'jest' };
const actor: AuthenticatedUserPayload = {
  email: 'me@healix.test',
  role: UserRole.INDEPENDENT_DOCTOR,
  sub: ME,
  tokenType: 'access',
};

type FindManyArgs = {
  select: Record<string, unknown>;
  take: number;
  where: { AND: unknown[] };
};

function argOf<T = unknown>(mock: jest.Mock, call = 0): T {
  return (mock.mock.calls[call] as [T])[0];
}

async function errorOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error as HttpException;
  }
  throw new Error('expected an error');
}

const codeOf = (error: HttpException) =>
  (error.getResponse() as { code: string }).code;

function setup() {
  const prisma = {
    $transaction: jest.fn(),
    conversationParticipant: { updateMany: jest.fn() },
    user: {
      findFirst: jest.fn().mockResolvedValue({ id: 'user-target' }),
      findMany: jest.fn().mockResolvedValue([]),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
    },
    userBlock: {
      create: jest.fn(),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
    },
  };
  prisma.$transaction.mockImplementation(
    (callback: (client: typeof prisma) => unknown) => callback(prisma),
  );
  const users = {
    activeWorkspaceIds: jest.fn().mockResolvedValue(['workspace-a']),
  };
  const auditLogs = { createAuditLog: jest.fn() };
  const service = new DirectoryService(
    prisma as unknown as PrismaService,
    users as unknown as MessagingUsersService,
    auditLogs as unknown as AuditLogsService,
  );
  return { auditLogs, prisma, service };
}

describe('DirectoryService.search', () => {
  it('lists verified, usable, discoverable professionals only, 20 at most, never the caller nor who blocked them', async () => {
    const { prisma, service } = setup();

    await service.search(actor, {});

    const args = argOf<FindManyArgs>(prisma.user.findMany);
    expect(args.take).toBe(DIRECTORY_LIMIT);
    expect(DIRECTORY_LIMIT).toBe(20);
    expect(args.where.AND).toEqual([
      reachableUserWhere,
      { discoverableByPeers: true },
      { id: { not: ME } },
      { blocksMade: { none: { blockedId: ME } } },
    ]);
    expect(Object.keys(args.select)).not.toContain('email');
    expect(Object.keys(args.select)).not.toContain('phone');
  });

  it('searches by name, speciality or wilaya, and narrows by speciality and wilaya', async () => {
    const { prisma, service } = setup();

    await service.search(actor, {
      search: '  Benali ',
      speciality: 'Cardio',
      wilaya: 'Oran',
    });

    const filters = argOf<FindManyArgs>(prisma.user.findMany).where.AND;
    expect(filters.slice(4)).toEqual([
      {
        OR: [
          { fullName: { contains: 'Benali' } },
          { establishment: { name: { contains: 'Benali' } } },
          { doctorProfile: { speciality: { contains: 'Benali' } } },
          { doctorProfile: { wilaya: { contains: 'Benali' } } },
          { establishment: { wilaya: { contains: 'Benali' } } },
        ],
      },
      { doctorProfile: { speciality: { contains: 'Cardio' } } },
      {
        OR: [
          { doctorProfile: { wilaya: { contains: 'Oran' } } },
          { establishment: { wilaya: { contains: 'Oran' } } },
        ],
      },
    ]);
  });

  it('tells whether a conversation would open at once, and whether the caller blocked them', async () => {
    const { prisma, service } = setup();
    prisma.user.findMany.mockResolvedValue([
      {
        blocksReceived: [{ id: 'block-1' }],
        discoverableByPeers: true,
        doctorProfile: {
          establishment: null,
          speciality: 'Neurologie',
          wilaya: 'Oran',
        },
        establishment: null,
        fullName: 'Dr Samir Kaci',
        id: 'user-samir',
        role: 'INDEPENDENT_DOCTOR',
        workspaceMemberships: [],
      },
    ]);

    await expect(service.search(actor, {})).resolves.toEqual([
      {
        blockedByMe: true,
        establishmentName: null,
        fullName: 'Dr Samir Kaci',
        id: 'user-samir',
        role: 'INDEPENDENT_DOCTOR',
        sameWorkspace: false,
        speciality: 'Neurologie',
        wilaya: 'Oran',
      },
    ]);
  });
});

describe('DirectoryService blocks', () => {
  it('refuses to block oneself, and answers a neutral 404 for an unknown user', async () => {
    const { prisma, service } = setup();
    expect(codeOf(await errorOf(service.block(actor, ME, context)))).toBe(
      'CANNOT_BLOCK_SELF',
    );

    prisma.user.findFirst.mockResolvedValue(null);
    const error = await errorOf(service.block(actor, 'user-x', context));
    expect(error.getStatus()).toBe(404);
  });

  it("blocks, takes the user's pending request out of the list, and audits", async () => {
    const { auditLogs, prisma, service } = setup();

    await expect(service.block(actor, 'user-target', context)).resolves.toEqual(
      { blocked: true, userId: 'user-target' },
    );

    expect(prisma.userBlock.create).toHaveBeenCalledWith({
      data: { blockedId: 'user-target', blockerId: ME },
    });
    expect(prisma.conversationParticipant.updateMany).toHaveBeenCalledWith({
      data: { status: 'BLOCKED' },
      where: {
        conversation: { directKey: 'user-me:user-target' },
        status: 'PENDING',
        userId: ME,
      },
    });
    expect(argOf(auditLogs.createAuditLog)).toEqual({
      action: 'USER_BLOCKED',
      entityId: 'user-target',
      entityType: 'USER',
      ipAddress: '203.0.113.7',
      userAgent: 'jest',
      userId: ME,
    });
  });

  it('is idempotent', async () => {
    const { auditLogs, prisma, service } = setup();
    prisma.userBlock.findUnique.mockResolvedValue({ id: 'block-1' });

    await service.block(actor, 'user-target', context);

    expect(prisma.userBlock.create).not.toHaveBeenCalled();
    expect(auditLogs.createAuditLog).not.toHaveBeenCalled();
  });

  it('unblocks, audited only when there was a block', async () => {
    const { auditLogs, prisma, service } = setup();

    await service.unblock(actor, 'user-target', context);
    expect(argOf(auditLogs.createAuditLog)).toMatchObject({
      action: 'USER_UNBLOCKED',
    });

    prisma.userBlock.deleteMany.mockResolvedValue({ count: 0 });
    await service.unblock(actor, 'user-target', context);
    expect(auditLogs.createAuditLog).toHaveBeenCalledTimes(1);
  });
});

describe('DirectoryService settings', () => {
  it("changes the caller's own discoverableByPeers only", async () => {
    const { prisma, service } = setup();
    prisma.user.update.mockResolvedValue({ discoverableByPeers: false });

    await service.updateSettings(actor, { discoverableByPeers: false });

    expect(prisma.user.update).toHaveBeenCalledWith({
      data: { discoverableByPeers: false },
      select: { discoverableByPeers: true },
      where: { id: ME },
    });
  });
});

describe('DirectoryController', () => {
  it('is for verified professionals only', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, DirectoryController)).toContain(
      VerifiedAccountGuard,
    );
    expect(Reflect.getMetadata(ROLES_KEY, DirectoryController)).toEqual([
      'ESTABLISHMENT_ADMIN',
      'INDEPENDENT_DOCTOR',
      'AFFILIATED_DOCTOR',
    ]);
  });
});
