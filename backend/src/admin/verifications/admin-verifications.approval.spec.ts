/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { type AuditLogsService } from '../../audit-logs/audit-logs.service';
import { type NotificationProducerService } from '../../notifications/notification-producer.service';
import { type PrismaService } from '../../prisma/prisma.service';
import { type StorageService } from '../../storage/storage.service';
import { type SubscriptionsService } from '../../subscriptions/subscriptions.service';
import { AdminVerificationsService } from './admin-verifications.service';

// An affiliated doctor's request: same shape as an independent doctor's one,
// only `type` tells the two apart. Before AFFILIATED_DOCTOR existed, every
// doctor request was recorded INDEPENDENT_DOCTOR — the review code must treat
// both doctor types identically, and never start a free trial for an
// affiliated doctor (an affiliated doctor holds no subscription of their
// own: they work under the one of their affiliation).
const affiliatedRequest = {
  doctorProfileId: 'profile-1',
  establishmentId: null,
  id: 'request-1',
  status: 'PENDING_VERIFICATION',
  type: 'AFFILIATED_DOCTOR',
  userId: 'doctor-1',
};

type SetupOptions = {
  request: Record<string, unknown>;
};

function setup(options: SetupOptions) {
  const transaction = {
    doctorProfile: { update: jest.fn() },
    establishment: { update: jest.fn() },
    user: { update: jest.fn() },
    verificationRequest: { update: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn((run: (client: unknown) => unknown) =>
      run(transaction),
    ),
  };
  const auditLogs = { createAuditLog: jest.fn().mockResolvedValue({}) };
  const subscriptions = {
    notifyTrialStarted: jest.fn().mockResolvedValue(undefined),
    startTrial: jest.fn().mockResolvedValue(null),
  };
  const notifications = { create: jest.fn().mockResolvedValue(null) };
  const service = new AdminVerificationsService(
    prisma as unknown as PrismaService,
    auditLogs as unknown as AuditLogsService,
    subscriptions as unknown as SubscriptionsService,
    {} as unknown as StorageService,
    notifications as unknown as NotificationProducerService,
  );
  // The checks of the file itself are not what is tested here.
  const internals = service as unknown as Record<string, unknown>;
  internals.assertCanApprove = jest.fn();
  internals.findVerificationOrThrow = jest
    .fn()
    .mockResolvedValue(options.request);

  return {
    auditLogs,
    notifications,
    prisma,
    service,
    subscriptions,
    transaction,
  };
}

describe('AdminVerificationsService with an affiliated doctor request', () => {
  it('approves the affiliated doctor profile like an independent one', async () => {
    const { service, subscriptions, transaction, auditLogs } = setup({
      request: affiliatedRequest,
    });

    const result = await service.approveVerification('request-1', 'admin-1', {
      adminNote: 'Dossier complet.',
    });

    expect(result.status).toBe('VERIFIED');
    expect(transaction.doctorProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { verificationStatus: 'VERIFIED' },
        where: { id: 'profile-1' },
      }),
    );
    expect(transaction.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ accountStatus: 'VERIFIED_NO_PLAN' }),
      }),
    );
    // An affiliated doctor never starts a free trial: the account cannot
    // hold a subscription, and startTrial would not accept the type anyway.
    expect(subscriptions.startTrial).not.toHaveBeenCalled();
    expect(auditLogs.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'VERIFICATION_APPROVED',
        metadata: expect.objectContaining({ type: 'AFFILIATED_DOCTOR' }),
      }),
      transaction,
    );
  });

  it('rejects the affiliated doctor profile after the transaction', async () => {
    const { service, transaction, notifications } = setup({
      request: affiliatedRequest,
    });

    await service.rejectVerification('request-1', 'admin-1', {
      reason: 'Document illisible.',
    });

    expect(transaction.doctorProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { verificationStatus: 'REJECTED' },
        where: { id: 'profile-1' },
      }),
    );
    // The notification stays out of the transaction: on rejection too.
    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'VERIFICATION_REJECTED' }),
    );
  });

  it('keeps the two doctor types distinguishable in the list filter', () => {
    const { service } = setup({ request: affiliatedRequest });
    const { buildVerificationWhere } = service as unknown as {
      buildVerificationWhere: (
        query: Record<string, unknown>,
      ) => Record<string, unknown>;
    };

    const affiliatedWhere = buildVerificationWhere({
      type: 'AFFILIATED_DOCTOR',
    });
    const independentWhere = buildVerificationWhere({
      type: 'INDEPENDENT_DOCTOR',
    });

    expect(affiliatedWhere).toEqual({ type: 'AFFILIATED_DOCTOR' });
    expect(independentWhere).toEqual({ type: 'INDEPENDENT_DOCTOR' });
  });
});
