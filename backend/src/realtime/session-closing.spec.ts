import { type ConfigService } from '@nestjs/config';

import { type AuditLogsService } from '../audit-logs/audit-logs.service';
import { AdminUsersService } from '../admin/users/admin-users.service';
import { DoctorsService } from '../doctors/doctors.service';
import { type PrismaService } from '../prisma/prisma.service';
import { type UsersService } from '../users/users.service';
import { type WorkspaceService } from '../workspaces/workspace.service';
import { type RealtimeService } from './realtime.service';
import { passThroughEntitlements } from '../subscriptions/testing/entitlements-stub';

// The writes that end the sessions of an account also close its sockets.

const DOCTOR_USER = 'user-doctor';

function realtimeMock() {
  return { disconnectUser: jest.fn().mockResolvedValue(undefined) };
}

describe('affiliated doctors managed by their establishment', () => {
  function setup() {
    const realtime = realtimeMock();
    const prisma = {
      $transaction: jest.fn((operations: unknown[]) =>
        Promise.resolve(operations.map(() => ({ accountStatus: 'SUSPENDED' }))),
      ),
      doctorProfile: {
        findUnique: jest.fn().mockResolvedValue({
          establishmentId: 'establishment-a',
          id: 'profile-1',
          isIndependent: false,
          user: { accountStatus: 'ACTIVE', id: DOCTOR_USER },
          userId: DOCTOR_USER,
        }),
      },
      refreshToken: { updateMany: jest.fn() },
      user: {
        update: jest.fn().mockResolvedValue({ accountStatus: 'ACTIVE' }),
      },
    };
    const service = new DoctorsService(
      prisma as unknown as PrismaService,
      {} as UsersService,
      {} as WorkspaceService,
      { get: () => '4' } as unknown as ConfigService,
      realtime as unknown as RealtimeService,
      passThroughEntitlements(),
    );
    return { realtime, service };
  }

  it.each([
    ['suspension', 'suspendAffiliatedDoctor'],
    ['reactivation', 'reactivateAffiliatedDoctor'],
    ['password reset', 'resetAffiliatedDoctorPassword'],
  ] as const)(
    'closes the sockets of the doctor on %s',
    async (_case, method) => {
      const { realtime, service } = setup();

      await service[method]('establishment-a', 'profile-1');

      expect(realtime.disconnectUser).toHaveBeenCalledWith(DOCTOR_USER);
    },
  );
});

describe('accounts suspended or reactivated by the back office', () => {
  function setup() {
    const realtime = realtimeMock();
    const prisma = {
      $transaction: jest.fn(),
      user: {
        findUnique: jest.fn().mockResolvedValue({
          accountStatus: 'ACTIVE',
          doctorProfile: { verificationStatus: 'VERIFIED' },
          establishment: null,
          id: DOCTOR_USER,
        }),
        update: jest.fn(),
      },
    };
    prisma.$transaction.mockImplementation(
      (callback: (client: typeof prisma) => unknown) => callback(prisma),
    );
    const service = new AdminUsersService(
      prisma as unknown as PrismaService,
      { createAuditLog: jest.fn() } as unknown as AuditLogsService,
      realtime as unknown as RealtimeService,
    );
    return { realtime, service };
  }

  it('closes the sockets on suspension and on reactivation', async () => {
    const { realtime, service } = setup();

    await service.suspendUser(DOCTOR_USER, 'admin-1', { reason: 'Contrôle' });
    await service.reactivateUser(DOCTOR_USER, 'admin-1');

    expect(realtime.disconnectUser).toHaveBeenCalledTimes(2);
    expect(realtime.disconnectUser).toHaveBeenNthCalledWith(1, DOCTOR_USER);
  });
});
