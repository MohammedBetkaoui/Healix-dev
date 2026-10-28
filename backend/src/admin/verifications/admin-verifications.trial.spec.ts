/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { type AuditLogsService } from '../../audit-logs/audit-logs.service';
import { type NotificationProducerService } from '../../notifications/notification-producer.service';
import { type PrismaService } from '../../prisma/prisma.service';
import { type StorageService } from '../../storage/storage.service';
import { type SubscriptionsService } from '../../subscriptions/subscriptions.service';
import { AdminVerificationsService } from './admin-verifications.service';

const request = {
  doctorProfileId: 'profile-1',
  establishmentId: null,
  id: 'request-1',
  status: 'PENDING_VERIFICATION',
  type: 'INDEPENDENT_DOCTOR',
  userId: 'doctor-1',
};

function setup(startedTrial: unknown) {
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
    startTrial: jest.fn().mockResolvedValue(startedTrial),
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
  internals.findVerificationOrThrow = jest.fn().mockResolvedValue(request);
  internals.assertCanApprove = jest.fn();

  return {
    auditLogs,
    notifications,
    prisma,
    service,
    subscriptions,
    transaction,
  };
}

describe('AdminVerificationsService.approveVerification starts the free trial', () => {
  it('starts it in the same transaction as the verification, and tells the user once committed', async () => {
    const trial = { id: 'sub-trial', userId: 'doctor-1' };
    const { auditLogs, prisma, service, subscriptions, transaction } =
      setup(trial);

    await service.approveVerification('request-1', 'admin-1', {});

    expect(transaction.verificationRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'VERIFIED' }),
      }),
    );
    expect(transaction.doctorProfile.update).toHaveBeenCalledWith({
      data: { verificationStatus: 'VERIFIED' },
      where: { id: 'profile-1' },
    });
    expect(subscriptions.startTrial).toHaveBeenCalledWith(
      'doctor-1',
      'INDEPENDENT_DOCTOR',
      transaction,
    );
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    // After the transaction, never inside.
    expect(subscriptions.notifyTrialStarted).toHaveBeenCalledWith(trial);
    expect(prisma.$transaction.mock.invocationCallOrder[0]).toBeLessThan(
      subscriptions.notifyTrialStarted.mock.invocationCallOrder[0],
    );
    expect(auditLogs.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'VERIFICATION_APPROVED',
        metadata: expect.objectContaining({ trialStarted: true }),
      }),
      transaction,
    );
  });

  it('uses the type of the request for an establishment', async () => {
    const { service, subscriptions, transaction } = setup({ id: 'sub-trial' });
    (service as unknown as Record<string, unknown>).findVerificationOrThrow =
      jest.fn().mockResolvedValue({
        ...request,
        doctorProfileId: null,
        establishmentId: 'establishment-1',
        type: 'ESTABLISHMENT',
        userId: 'owner-1',
      });

    await service.approveVerification('request-1', 'admin-1', {});

    expect(subscriptions.startTrial).toHaveBeenCalledWith(
      'owner-1',
      'ESTABLISHMENT',
      transaction,
    );
  });

  it('gives no second trial: an account that already had a subscription is just verified', async () => {
    const { auditLogs, notifications, service, subscriptions, transaction } =
      setup(null);

    const result = await service.approveVerification(
      'request-1',
      'admin-1',
      {},
    );

    expect(result.status).toBe('VERIFIED');
    expect(subscriptions.notifyTrialStarted).not.toHaveBeenCalled();
    expect(auditLogs.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ trialStarted: false }),
      }),
      transaction,
    );
    // The verification notification is sent all the same.
    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'VERIFICATION_APPROVED' }),
    );
  });
});
