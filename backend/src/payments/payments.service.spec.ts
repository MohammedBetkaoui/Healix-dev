import { ConflictException } from '@nestjs/common';
import { type Payment } from '@prisma/client';

import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { BillingPeriod } from '../common/enums/billing-period.enum';
import { PaymentMethod } from '../common/enums/payment-method.enum';
import { PaymentProofDocumentType } from '../common/enums/payment-proof-document-type.enum';
import { PaymentStatus } from '../common/enums/payment-status.enum';
import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionPlansService } from '../subscriptions/plans/subscription-plans.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { PaymentsService } from './payments.service';
import { PaymentProofService } from './proofs/payment-proof.service';
import { PaymentProofStorageService } from './proofs/payment-proof-storage.service';
import { PaymentProofValidator } from './proofs/payment-proof-validator';
import { createPaymentReference } from './utils/payment-reference.util';

const userId = 'user-1';

const plan = {
  id: 'plan-pro',
  code: 'DOCTOR_PRO',
  accountType: 'INDEPENDENT_DOCTOR',
  active: true,
  custom: false,
  currency: 'DZD',
  monthlyPrice: 2500,
  annualPrice: 25000,
};

const openPayment = (overrides: Partial<Payment> = {}): Payment =>
  ({
    id: 'pay-open',
    reference: 'HLX-PAY-2026-000001',
    userId,
    planId: plan.id,
    accountType: 'INDEPENDENT_DOCTOR',
    amount: 2500,
    currency: 'DZD',
    billingPeriod: BillingPeriod.MONTHLY,
    method: PaymentMethod.MANUAL_POST_TRANSFER,
    status: PaymentStatus.WAITING_PAYMENT,
    createdAt: new Date('2026-10-01T10:00:00.000Z'),
    ...overrides,
  }) as Payment;

describe('PaymentsService.createIntent', () => {
  const queryRaw = jest.fn();
  const findMany = jest.fn();
  const updateMany = jest.fn();
  const create = jest.fn();
  const auditLogCreate = jest.fn();
  const transaction = {
    $queryRaw: queryRaw,
    auditLog: { create: auditLogCreate },
    payment: { create, findMany, updateMany },
  };
  const prisma = {
    $transaction: jest.fn((callback: (client: unknown) => unknown) =>
      callback(transaction),
    ),
    payment: {
      count: jest.fn().mockResolvedValue(41),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    subscriptionPlan: { findFirst: jest.fn() },
    user: { findUnique: jest.fn() },
  };
  const prismaService = prisma as unknown as PrismaService;
  const auditLogsService = new AuditLogsService(prismaService);
  const service = new PaymentsService(
    prismaService,
    auditLogsService,
    {} as SubscriptionPlansService,
    new SubscriptionsService(prismaService, auditLogsService),
    {} as PaymentProofService,
    {} as PaymentProofStorageService,
    {} as PaymentProofValidator,
  );

  const dto = {
    billingPeriod: BillingPeriod.MONTHLY,
    paymentMethod: PaymentMethod.MANUAL_POST_TRANSFER,
    planId: plan.id,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.user.findUnique.mockResolvedValue({
      id: userId,
      role: 'INDEPENDENT_DOCTOR',
      accountStatus: 'VERIFIED_NO_PLAN',
      doctorProfile: {
        subscriptionStatus: 'NO_PLAN',
        verificationStatus: 'VERIFIED',
      },
      establishment: null,
    });
    prisma.subscriptionPlan.findFirst.mockResolvedValue(plan);
    queryRaw.mockResolvedValue([{ id: userId }]);
    findMany.mockResolvedValue([]);
    updateMany.mockResolvedValue({ count: 1 });
    create.mockImplementation(({ data }: { data: Partial<Payment> }) =>
      Promise.resolve(openPayment({ ...data, id: 'pay-new' })),
    );
    auditLogCreate.mockResolvedValue({});
  });

  const auditActions = () =>
    auditLogCreate.mock.calls.map(
      ([{ data }]: [{ data: { action: string } }]) => data.action,
    );

  it('creates a payment when the user has no open payment', async () => {
    const response = await service.createIntent(userId, dto);

    expect(queryRaw).toHaveBeenCalledTimes(1);
    const [sqlParts, ...sqlValues] = queryRaw.mock.calls[0] as [
      TemplateStringsArray,
      ...unknown[],
    ];
    expect(sqlParts.join('?')).toContain('FOR UPDATE');
    expect(sqlValues).toEqual([userId]);
    // The lock is taken before the open payments are read.
    expect(queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      findMany.mock.invocationCallOrder[0],
    );
    expect(findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: 'desc' },
      where: {
        status: {
          in: [
            PaymentStatus.CREATED,
            PaymentStatus.WAITING_PAYMENT,
            PaymentStatus.WAITING_ADMIN_REVIEW,
          ],
        },
        userId,
      },
    });
    expect(updateMany).not.toHaveBeenCalled();
    // payment.count() resolves 41: the first free sequence is 42.
    const expectedReference = createPaymentReference(42);
    expect(create).toHaveBeenCalledTimes(1);
    const [{ data: createdData }] = create.mock.calls[0] as [
      { data: Partial<Payment> },
    ];
    expect(createdData).toMatchObject({
      amount: 2500,
      billingPeriod: BillingPeriod.MONTHLY,
      method: PaymentMethod.MANUAL_POST_TRANSFER,
      planId: plan.id,
      reference: expectedReference,
      status: PaymentStatus.WAITING_PAYMENT,
      userId,
    });
    expect(auditActions()).toEqual(['PAYMENT_INTENT_CREATED']);
    expect(response).toEqual({
      paymentId: 'pay-new',
      reference: expectedReference,
      amount: 2500,
      currency: 'DZD',
      method: PaymentMethod.MANUAL_POST_TRANSFER,
      nextAction: 'UPLOAD_PAYMENT_PROOF',
      redirectTo: '/subscription/checkout/manual-proof?paymentId=pay-new',
      ccp: '00799999002888754878',
    });
  });

  it.each([PaymentStatus.CREATED, PaymentStatus.WAITING_PAYMENT])(
    'returns the open %s payment of the same plan, period and method',
    async (status) => {
      findMany.mockResolvedValue([openPayment({ status })]);

      const response = await service.createIntent(userId, dto);

      expect(create).not.toHaveBeenCalled();
      expect(updateMany).not.toHaveBeenCalled();
      expect(auditLogCreate).not.toHaveBeenCalled();
      // Same shape as a newly created intent.
      expect(response).toEqual({
        paymentId: 'pay-open',
        reference: 'HLX-PAY-2026-000001',
        amount: 2500,
        currency: 'DZD',
        method: PaymentMethod.MANUAL_POST_TRANSFER,
        nextAction: 'UPLOAD_PAYMENT_PROOF',
        redirectTo: '/subscription/checkout/manual-proof?paymentId=pay-open',
        ccp: '00799999002888754878',
      });
    },
  );

  it('cancels an open payment of another plan, then creates the new one', async () => {
    findMany.mockResolvedValue([
      openPayment({ id: 'pay-old', planId: 'plan-basic' }),
    ]);

    const response = await service.createIntent(userId, dto);

    expect(updateMany).toHaveBeenCalledWith({
      data: { status: PaymentStatus.CANCELED },
      where: {
        id: 'pay-old',
        status: { in: [PaymentStatus.CREATED, PaymentStatus.WAITING_PAYMENT] },
      },
    });
    expect(create).toHaveBeenCalledTimes(1);
    expect(auditActions()).toEqual([
      'PAYMENT_INTENT_SUPERSEDED',
      'PAYMENT_INTENT_CREATED',
    ]);
    const [{ data: supersededLog }] = auditLogCreate.mock.calls[0] as [
      { data: Record<string, unknown> },
    ];
    expect(supersededLog).toMatchObject({
      entityId: 'pay-old',
      entityType: 'PAYMENT',
      metadata: { planId: 'plan-basic', supersededByPaymentId: 'pay-new' },
    });
    // Cancel, create and audit logs all go through the one transaction.
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(response.paymentId).toBe('pay-new');
  });

  it('cancels an open payment of another billing period or method', async () => {
    findMany.mockResolvedValue([
      openPayment({ id: 'pay-annual', billingPeriod: BillingPeriod.ANNUAL }),
      openPayment({
        id: 'pay-card',
        method: PaymentMethod.SYNTHETIC_CHARGILY,
        status: PaymentStatus.CREATED,
      }),
    ]);

    await service.createIntent(userId, dto);

    expect(
      updateMany.mock.calls.map(
        ([args]: [{ where: { id: string } }]) => args.where.id,
      ),
    ).toEqual(['pay-annual', 'pay-card']);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('refuses while a payment is waiting for admin review, and never cancels it', async () => {
    findMany.mockResolvedValue([
      openPayment({ id: 'pay-newer', status: PaymentStatus.CREATED }),
      openPayment({
        id: 'pay-review',
        planId: 'plan-basic',
        status: PaymentStatus.WAITING_ADMIN_REVIEW,
      }),
    ]);

    const error: unknown = await service
      .createIntent(userId, dto)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getStatus()).toBe(409);
    expect((error as ConflictException).getResponse()).toEqual({
      code: 'PAYMENT_ALREADY_PENDING',
      message: 'Un paiement est déjà en cours de vérification.',
      paymentId: 'pay-review',
    });
    expect(updateMany).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(auditLogCreate).not.toHaveBeenCalled();
  });

  it('refuses a second cash request: cash starts directly in admin review', async () => {
    findMany.mockResolvedValue([
      openPayment({
        method: PaymentMethod.MANUAL_CASH,
        status: PaymentStatus.WAITING_ADMIN_REVIEW,
      }),
    ]);

    await expect(
      service.createIntent(userId, {
        ...dto,
        paymentMethod: PaymentMethod.MANUAL_CASH,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(create).not.toHaveBeenCalled();
  });

  it('refuses when the payment to cancel moved on since it was read', async () => {
    findMany.mockResolvedValue([
      openPayment({ id: 'pay-old', planId: 'plan-basic' }),
    ]);
    // e.g. its proof was uploaded in between: the guarded update matches nothing.
    updateMany.mockResolvedValue({ count: 0 });

    await expect(service.createIntent(userId, dto)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(create).not.toHaveBeenCalled();
    expect(auditLogCreate).not.toHaveBeenCalled();
  });
});

describe('PaymentsService.uploadProof', () => {
  it('refuses a proof on a cancelled (superseded) payment', async () => {
    const storePaymentProof = jest.fn();
    const prisma = {
      payment: {
        findFirst: jest
          .fn()
          .mockResolvedValue(openPayment({ status: PaymentStatus.CANCELED })),
      },
    } as unknown as PrismaService;
    const service = new PaymentsService(
      prisma,
      {} as AuditLogsService,
      {} as SubscriptionPlansService,
      {} as SubscriptionsService,
      {} as PaymentProofService,
      { storePaymentProof } as unknown as PaymentProofStorageService,
      {} as PaymentProofValidator,
    );

    await expect(
      service.uploadProof(userId, 'pay-open', {
        file: {} as Express.Multer.File,
        proofType: PaymentProofDocumentType.POST_TRANSFER_PROOF,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(storePaymentProof).not.toHaveBeenCalled();
  });
});
