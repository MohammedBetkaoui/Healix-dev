/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  BadRequestException,
  ConflictException,
  type HttpException,
} from '@nestjs/common';
import { type Payment } from '@prisma/client';

import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { BillingPeriod } from '../common/enums/billing-period.enum';
import { PaymentMethod } from '../common/enums/payment-method.enum';
import { PaymentStatus } from '../common/enums/payment-status.enum';
import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionPlansService } from '../subscriptions/plans/subscription-plans.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { PaymentsService } from './payments.service';
import { PaymentProofService } from './proofs/payment-proof.service';
import { PaymentProofStorageService } from './proofs/payment-proof-storage.service';
import { PaymentProofValidator } from './proofs/payment-proof-validator';

const userId = 'user-1';

const plan = {
  id: 'plan-pro',
  code: 'DOCTOR_PRO',
  accountType: 'INDEPENDENT_DOCTOR',
  active: true,
  custom: false,
  currency: 'DZD',
  monthlyPrice: 5900,
  annualPrice: 59000,
};

const demoCard = {
  cardHolderName: 'barkaoui  mourad',
  cardNumber: '1234 1234 1234 1234',
  expiryMonth: '09',
  expiryYear: '2030',
  psv: '353',
};

const cardPayment = (overrides: Partial<Payment> = {}): Payment =>
  ({
    id: 'pay-card',
    reference: 'HLX-PAY-2026-000007',
    userId,
    planId: plan.id,
    accountType: 'INDEPENDENT_DOCTOR',
    amount: 5900,
    currency: 'DZD',
    billingPeriod: BillingPeriod.MONTHLY,
    method: PaymentMethod.SYNTHETIC_CHARGILY,
    status: PaymentStatus.CREATED,
    cardLast4: null,
    createdAt: new Date('2026-10-01T10:00:00.000Z'),
    ...overrides,
  }) as Payment;

const codeOf = (error: unknown) =>
  ((error as HttpException).getResponse() as { code?: string }).code;

async function errorOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected an error');
}

function setup() {
  const queryRaw = jest.fn().mockResolvedValue([]);
  const transaction = {
    $queryRaw: queryRaw,
    auditLog: { create: jest.fn().mockResolvedValue({}) },
    payment: {
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
    },
  };
  const prisma = {
    $transaction: jest.fn((run: (client: unknown) => unknown) =>
      run(transaction),
    ),
    auditLog: { create: jest.fn().mockResolvedValue({}) },
    payment: {
      count: jest.fn().mockResolvedValue(0),
      findFirst: jest.fn(),
      findUnique: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    subscriptionPlan: { findFirst: jest.fn().mockResolvedValue(plan) },
    user: {
      findUnique: jest.fn().mockResolvedValue({
        id: userId,
        role: 'INDEPENDENT_DOCTOR',
        accountStatus: 'VERIFIED_NO_PLAN',
        doctorProfile: {
          subscriptionStatus: 'NO_PLAN',
          verificationStatus: 'VERIFIED',
        },
        establishment: null,
      }),
    },
  };
  const prismaService = prisma as unknown as PrismaService;
  const auditLogsService = new AuditLogsService(prismaService);
  const subscriptions = {
    applyPurchase: jest.fn(),
    notifyPurchase: jest.fn().mockResolvedValue(undefined),
    previewPurchase: jest.fn(),
  };
  const real = new SubscriptionsService(prismaService, auditLogsService);
  const service = new PaymentsService(
    prismaService,
    auditLogsService,
    {} as SubscriptionPlansService,
    {
      ...subscriptions,
      assertCanStartPayment: real.assertCanStartPayment.bind(real),
      getAccountContextFromUser: real.getAccountContextFromUser.bind(real),
    } as unknown as SubscriptionsService,
    {} as PaymentProofService,
    {} as PaymentProofStorageService,
    {} as PaymentProofValidator,
  );

  return { prisma, service, subscriptions, transaction };
}

describe('PaymentsService.createIntent: offline settlements are off by default', () => {
  afterEach(() => {
    delete process.env.MANUAL_PAYMENTS_ENABLED;
  });

  const intent = (paymentMethod: PaymentMethod) => ({
    billingPeriod: BillingPeriod.MONTHLY,
    paymentMethod,
    planId: plan.id,
  });

  it.each([
    PaymentMethod.MANUAL_CASH,
    PaymentMethod.MANUAL_POST_TRANSFER,
    PaymentMethod.BARIDIMOB_RECEIPT,
  ])('refuses %s with 400 PAYMENT_METHOD_DISABLED', async (method) => {
    const { prisma, service } = setup();

    const error = await errorOf(service.createIntent(userId, intent(method)));

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getStatus()).toBe(400);
    expect(codeOf(error)).toBe('PAYMENT_METHOD_DISABLED');
    // Nothing was read or written.
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each(['false', '', 'no', '0'])(
    'stays off when MANUAL_PAYMENTS_ENABLED is %p',
    async (value) => {
      process.env.MANUAL_PAYMENTS_ENABLED = value;
      const { service } = setup();

      const error = await errorOf(
        service.createIntent(userId, intent(PaymentMethod.MANUAL_CASH)),
      );

      expect(codeOf(error)).toBe('PAYMENT_METHOD_DISABLED');
    },
  );

  it('accepts the online card payment, the normal way to subscribe', async () => {
    const { prisma, service, transaction } = setup();
    (transaction as Record<string, unknown>).payment = {
      create: jest
        .fn()
        .mockImplementation(({ data }: { data: Partial<Payment> }) =>
          Promise.resolve(cardPayment({ ...data, id: 'pay-new' })),
        ),
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn(),
    };

    const response = await service.createIntent(
      userId,
      intent(PaymentMethod.SYNTHETIC_CHARGILY),
    );

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(response).toMatchObject({
      nextAction: 'OPEN_SYNTHETIC_CHARGILY_PAGE',
      paymentId: 'pay-new',
      redirectTo: '/subscription/checkout/synthetic-chargily?paymentId=pay-new',
    });
  });

  it('accepts the offline settlements once the deployment turns them on', async () => {
    process.env.MANUAL_PAYMENTS_ENABLED = 'true';
    const { service, transaction } = setup();
    (transaction as Record<string, unknown>).payment = {
      create: jest
        .fn()
        .mockImplementation(({ data }: { data: Partial<Payment> }) =>
          Promise.resolve(cardPayment({ ...data, id: 'pay-cash' })),
        ),
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn(),
    };

    await expect(
      service.createIntent(userId, intent(PaymentMethod.MANUAL_CASH)),
    ).resolves.toMatchObject({ nextAction: 'WAIT_ADMIN_CASH_ACTIVATION' });
  });

  it('refuses a plan on quote (EST_CUSTOM) with 400 PLAN_REQUIRES_CONTACT', async () => {
    const { prisma, service } = setup();
    prisma.subscriptionPlan.findFirst.mockResolvedValue({
      ...plan,
      code: 'EST_CUSTOM',
      custom: true,
      monthlyPrice: null,
    });

    const error = await errorOf(
      service.createIntent(userId, intent(PaymentMethod.SYNTHETIC_CHARGILY)),
    );

    expect((error as BadRequestException).getStatus()).toBe(400);
    expect(codeOf(error)).toBe('PLAN_REQUIRES_CONTACT');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('PaymentsService.payWithSyntheticChargily', () => {
  it('activates the subscription in the same transaction as the payment', async () => {
    const { prisma, service, subscriptions, transaction } = setup();
    const stored = cardPayment();
    prisma.payment.findFirst.mockResolvedValue(stored);
    transaction.payment.findUniqueOrThrow.mockResolvedValue(stored);
    transaction.payment.update.mockImplementation(
      ({ data }: { data: Partial<Payment> }) =>
        Promise.resolve({ ...stored, ...data }),
    );
    const subscription = {
      expiresAt: new Date('2026-12-06T12:00:00.000Z'),
      id: 'sub-1',
      startedAt: new Date('2026-10-06T12:00:00.000Z'),
      status: 'ACTIVE',
      trial: false,
    };
    const outcome = { paymentId: stored.id, subscription, userId };
    subscriptions.applyPurchase.mockResolvedValue(outcome);

    const response = await service.payWithSyntheticChargily(
      userId,
      stored.id,
      demoCard,
    );

    // The payment is PAID with the card's last four digits and its holder.
    expect(transaction.payment.update).toHaveBeenCalledWith({
      data: expect.objectContaining({
        cardHolderName: 'BARKAOUI MOURAD',
        cardLast4: '1234',
        providerStatus: 'PAID_DEMO',
        status: PaymentStatus.PAID,
      }),
      where: { id: stored.id },
    });
    // The subscription is applied inside that very transaction, to the paid payment.
    expect(subscriptions.applyPurchase).toHaveBeenCalledTimes(1);
    const [appliedPayment, appliedClient] = subscriptions.applyPurchase.mock
      .calls[0] as [Payment, unknown];
    expect(appliedPayment.status).toBe(PaymentStatus.PAID);
    expect(appliedClient).toBe(transaction);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    // The notification goes out once it has committed.
    expect(subscriptions.notifyPurchase).toHaveBeenCalledWith(outcome);
    expect(prisma.$transaction.mock.invocationCallOrder[0]).toBeLessThan(
      subscriptions.notifyPurchase.mock.invocationCallOrder[0],
    );
    expect(response).toMatchObject({
      subscription: { expiresAt: subscription.expiresAt, status: 'ACTIVE' },
      subscriptionId: 'sub-1',
    });
  });

  it('locks the payment row, then reads it again, before paying it', async () => {
    const { prisma, service, subscriptions, transaction } = setup();
    const stored = cardPayment();
    prisma.payment.findFirst.mockResolvedValue(stored);
    transaction.payment.findUniqueOrThrow.mockResolvedValue(stored);
    transaction.payment.update.mockResolvedValue(stored);
    subscriptions.applyPurchase.mockResolvedValue({
      paymentId: stored.id,
      subscription: { id: 'sub-1' },
      userId,
    });

    await service.payWithSyntheticChargily(userId, stored.id, demoCard);

    const [sqlParts, ...values] = transaction.$queryRaw.mock.calls[0] as [
      TemplateStringsArray,
      ...unknown[],
    ];
    expect(sqlParts.join('?')).toContain('FROM payments');
    expect(sqlParts.join('?')).toContain('FOR UPDATE');
    expect(values).toEqual([stored.id]);
    const order = (mock: jest.Mock) => mock.mock.invocationCallOrder[0];
    expect(order(transaction.$queryRaw)).toBeLessThan(
      order(transaction.payment.findUniqueOrThrow),
    );
    expect(order(transaction.payment.findUniqueOrThrow)).toBeLessThan(
      order(transaction.payment.update),
    );
  });

  it('never stores the card number nor the security code', async () => {
    const { prisma, service, subscriptions, transaction } = setup();
    const stored = cardPayment();
    prisma.payment.findFirst.mockResolvedValue(stored);
    transaction.payment.findUniqueOrThrow.mockResolvedValue(stored);
    transaction.payment.update.mockResolvedValue(stored);
    subscriptions.applyPurchase.mockResolvedValue({
      paymentId: stored.id,
      subscription: { id: 'sub-1' },
      userId,
    });

    await service.payWithSyntheticChargily(userId, stored.id, demoCard);

    const written = JSON.stringify([
      transaction.payment.update.mock.calls,
      transaction.auditLog.create.mock.calls,
      prisma.payment.updateMany.mock.calls,
      prisma.auditLog.create.mock.calls,
    ]);
    expect(written).toContain('"cardLast4":"1234"');
    expect(written).not.toContain('1234123412341234');
    expect(written).not.toContain('1234 1234 1234 1234');
    expect(written).not.toContain('353');
    expect(written).not.toMatch(/psv|cvv|cvc/i);
  });

  it('declines another card with 400, marks the payment FAILED, and touches no subscription', async () => {
    const { prisma, service, subscriptions, transaction } = setup();
    const stored = cardPayment();
    prisma.payment.findFirst.mockResolvedValue(stored);

    const error = await errorOf(
      service.payWithSyntheticChargily(userId, stored.id, {
        ...demoCard,
        cardNumber: '4000 0000 0000 0002',
        psv: '999',
      }),
    );

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getStatus()).toBe(400);
    expect(codeOf(error)).toBe('PAYMENT_DECLINED');
    // Guarded by the status, so a payment that moved on is never failed.
    expect(prisma.payment.updateMany).toHaveBeenCalledWith({
      data: {
        providerStatus: 'FAILED_DEMO_CARD',
        status: PaymentStatus.FAILED,
      },
      where: {
        id: stored.id,
        status: { in: [PaymentStatus.CREATED, PaymentStatus.WAITING_PAYMENT] },
      },
    });
    expect(subscriptions.applyPurchase).not.toHaveBeenCalled();
    expect(subscriptions.notifyPurchase).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(transaction.payment.update).not.toHaveBeenCalled();
    // The refusal is logged with the last digits only.
    const logged = JSON.stringify(prisma.auditLog.create.mock.calls);
    expect(logged).toContain('SYNTHETIC_CHARGILY_PAYMENT_FAILED');
    expect(logged).toContain('"last4":"0002"');
    expect(logged).not.toContain('4000');
    expect(logged).not.toContain('999');
  });

  it('answers 409 to a payment that is already PAID: paying twice does not extend twice', async () => {
    const { prisma, service, subscriptions } = setup();
    prisma.payment.findFirst.mockResolvedValue(
      cardPayment({ status: PaymentStatus.PAID }),
    );

    const error = await errorOf(
      service.payWithSyntheticChargily(userId, 'pay-card', demoCard),
    );

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getStatus()).toBe(409);
    expect(subscriptions.applyPurchase).not.toHaveBeenCalled();
  });

  it('answers 409 to the second of two simultaneous payments: it waits for the lock and finds the payment PAID', async () => {
    const { prisma, service, subscriptions, transaction } = setup();
    // Both requests read CREATED, before either holds the lock...
    prisma.payment.findFirst.mockResolvedValue(cardPayment());
    // ...the lock is acquired after the first committed.
    transaction.payment.findUniqueOrThrow.mockResolvedValue(
      cardPayment({ status: PaymentStatus.PAID }),
    );

    const error = await errorOf(
      service.payWithSyntheticChargily(userId, 'pay-card', demoCard),
    );

    expect(error).toBeInstanceOf(ConflictException);
    expect(transaction.payment.update).not.toHaveBeenCalled();
    expect(subscriptions.applyPurchase).not.toHaveBeenCalled();
  });

  it('refuses a failed payment, which cannot be retried (a new intent is made)', async () => {
    const { prisma, service } = setup();
    prisma.payment.findFirst.mockResolvedValue(
      cardPayment({ status: PaymentStatus.FAILED }),
    );

    await expect(
      service.payWithSyntheticChargily(userId, 'pay-card', demoCard),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuses an expired card date and a payment that is not a card payment', async () => {
    const { prisma, service } = setup();

    await expect(
      service.payWithSyntheticChargily(userId, 'pay-card', {
        ...demoCard,
        expiryYear: '2019',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.payment.findFirst.mockResolvedValue(
      cardPayment({ method: PaymentMethod.MANUAL_CASH }),
    );
    await expect(
      service.payWithSyntheticChargily(userId, 'pay-card', demoCard),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('PaymentsService.getPayment', () => {
  const preview = {
    currentExpiresAt: new Date('2026-10-20T00:00:00.000Z'),
    endsTrial: true,
    expiresAt: new Date('2026-11-20T00:00:00.000Z'),
    type: 'PURCHASED',
  };

  it('shows what paying would do before the card form: the new expiry', async () => {
    const { prisma, service, subscriptions } = setup();
    prisma.payment.findFirst.mockResolvedValue(cardPayment());
    subscriptions.previewPurchase.mockResolvedValue(preview);

    const result = await service.getPayment(userId, 'pay-card');

    expect(subscriptions.previewPurchase).toHaveBeenCalledWith(
      expect.objectContaining({ planId: plan.id, userId }),
    );
    expect(result.expiryPreview).toEqual(preview);
  });

  it('shows no preview once the payment is settled', async () => {
    const { prisma, service, subscriptions } = setup();
    prisma.payment.findFirst.mockResolvedValue(
      cardPayment({ status: PaymentStatus.PAID }),
    );

    const result = await service.getPayment(userId, 'pay-card');

    expect(result.expiryPreview).toBeNull();
    expect(subscriptions.previewPurchase).not.toHaveBeenCalled();
  });
});
