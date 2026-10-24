/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { type HttpException } from '@nestjs/common';

import { AccountType } from '../common/enums/account-type.enum';
import { SubscriptionStatus } from '../common/enums/subscription-status.enum';
import { UserRole } from '../common/enums/user-role.enum';
import { type PrismaService } from '../prisma/prisma.service';
import { type WorkspaceContextService } from '../workspaces/workspace-context.service';
import { type Entitlements } from './entitlements';
import {
  assertQuotaAvailable,
  EntitlementsService,
} from './entitlements.service';
import { type PlanQuotas } from './plans/plan-quotas';

const now = new Date('2026-10-16T09:00:00.000Z');
const day = (days: number) =>
  new Date(now.getTime() + days * 24 * 60 * 60 * 1_000);

const proQuotas: PlanQuotas = {
  aiAnalysesPerMonth: 100,
  aiPipelines: ['brain', 'pathology-breast', 'cardio-ecg'],
  maxDoctors: 1,
  maxPatients: null,
};

const subscriptionRow = (overrides: Record<string, unknown> = {}) => ({
  customQuotas: null,
  expiresAt: day(20),
  plan: {
    code: 'DOCTOR_PRO',
    custom: false,
    id: 'plan-pro',
    name: 'Pro',
    quotas: proQuotas,
  },
  startedAt: new Date('2026-09-01T08:00:00.000Z'),
  status: SubscriptionStatus.ACTIVE,
  trial: false,
  ...overrides,
});

const codeOf = (error: unknown) =>
  ((error as HttpException).getResponse() as { code: string }).code;
const bodyOf = (error: unknown) =>
  (error as HttpException).getResponse() as Record<string, unknown>;

async function errorOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected an error');
}

function setup() {
  const prisma = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    $transaction: jest.fn(),
    aiAnalysisRun: { count: jest.fn().mockResolvedValue(0) },
    patient: { count: jest.fn().mockResolvedValue(0) },
    subscription: { findFirst: jest.fn() },
    workspace: { findFirst: jest.fn(), findUnique: jest.fn() },
    workspaceMembership: { count: jest.fn().mockResolvedValue(0) },
  };
  prisma.$transaction.mockImplementation(
    (run: (client: typeof prisma) => Promise<unknown>) => run(prisma),
  );
  const workspaceContext = { resolveWorkspaceForUser: jest.fn() };
  const service = new EntitlementsService(
    prisma as unknown as PrismaService,
    workspaceContext as unknown as WorkspaceContextService,
  );

  return { prisma, service, workspaceContext };
}

const establishmentWorkspace = {
  establishment: { ownerId: 'owner-1' },
  ownerDoctorProfile: null,
  type: 'ESTABLISHMENT',
};
const privateWorkspace = {
  establishment: null,
  ownerDoctorProfile: { userId: 'doctor-1' },
  type: 'PRIVATE_PRACTICE',
};

describe('EntitlementsService: whose subscription applies', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now);
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('is the owner subscription for an establishment workspace', async () => {
    const { prisma, service } = setup();
    prisma.workspace.findUnique.mockResolvedValue(establishmentWorkspace);
    prisma.subscription.findFirst.mockResolvedValue(subscriptionRow());

    const result = await service.getEntitlements('workspace-est');

    expect(prisma.subscription.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'owner-1' } }),
    );
    expect(result).toMatchObject({ readOnly: false, status: 'ACTIVE' });
  });

  it('is the establishment subscription for an affiliated doctor, who has none of their own', async () => {
    const { prisma, service, workspaceContext } = setup();
    workspaceContext.resolveWorkspaceForUser.mockResolvedValue({
      workspaceId: 'workspace-est',
    });
    prisma.workspace.findUnique.mockResolvedValue(establishmentWorkspace);
    prisma.subscription.findFirst.mockResolvedValue(subscriptionRow());

    const result = await service.getEntitlementsForUser({
      role: UserRole.AFFILIATED_DOCTOR,
      sub: 'affiliated-1',
    });

    expect(workspaceContext.resolveWorkspaceForUser).toHaveBeenCalledWith({
      role: UserRole.AFFILIATED_DOCTOR,
      userId: 'affiliated-1',
    });
    // Never the doctor's own user id.
    expect(prisma.subscription.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'owner-1' } }),
    );
    expect(result.readOnly).toBe(false);
  });

  it('follows the establishment into read-only mode for its affiliated doctors', async () => {
    const { prisma, service, workspaceContext } = setup();
    workspaceContext.resolveWorkspaceForUser.mockResolvedValue({
      workspaceId: 'workspace-est',
    });
    prisma.workspace.findUnique.mockResolvedValue(establishmentWorkspace);
    prisma.subscription.findFirst.mockResolvedValue(
      subscriptionRow({ status: SubscriptionStatus.EXPIRED }),
    );

    await expect(
      service.getEntitlementsForUser({
        role: UserRole.AFFILIATED_DOCTOR,
        sub: 'affiliated-1',
      }),
    ).resolves.toMatchObject({ readOnly: true, status: 'EXPIRED' });
  });

  it('is the doctor subscription for a private practice, and counts one doctor', async () => {
    const { prisma, service } = setup();
    prisma.workspace.findUnique.mockResolvedValue(privateWorkspace);
    prisma.subscription.findFirst.mockResolvedValue(subscriptionRow());

    const result = await service.getEntitlements('workspace-private');

    expect(prisma.subscription.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'doctor-1' } }),
    );
    expect(result.usage.doctors).toBe(1);
    expect(prisma.workspaceMembership.count).not.toHaveBeenCalled();
  });

  it('is read-only for a workspace that has no paying owner', async () => {
    const { prisma, service } = setup();
    prisma.workspace.findUnique.mockResolvedValue(null);

    await expect(service.getEntitlements('ghost')).resolves.toMatchObject({
      plan: null,
      readOnly: true,
      status: SubscriptionStatus.NO_PLAN,
    });
  });

  it('resolves an account (the admin console starts from the paying user)', async () => {
    const { prisma, service } = setup();
    prisma.workspace.findFirst.mockResolvedValue({ id: 'workspace-est' });
    prisma.workspace.findUnique.mockResolvedValue(establishmentWorkspace);
    prisma.subscription.findFirst.mockResolvedValue(subscriptionRow());

    await service.getEntitlementsForAccount(
      'owner-1',
      AccountType.ESTABLISHMENT,
    );

    expect(prisma.workspace.findFirst).toHaveBeenCalledWith({
      select: { id: true },
      where: { establishment: { ownerId: 'owner-1' } },
    });
  });
});

describe('EntitlementsService: the usage', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now);
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('counts the active patients of the workspace', async () => {
    const { prisma, service } = setup();
    prisma.workspace.findUnique.mockResolvedValue(establishmentWorkspace);
    prisma.subscription.findFirst.mockResolvedValue(subscriptionRow());
    prisma.patient.count.mockResolvedValue(12);

    const result = await service.getEntitlements('workspace-est');

    expect(prisma.patient.count).toHaveBeenCalledWith({
      where: { administrativeStatus: 'ACTIVE', workspaceId: 'workspace-est' },
    });
    expect(result.usage.patients).toBe(12);
  });

  it('counts the active doctor members of an establishment, never a suspended one', async () => {
    const { prisma, service } = setup();
    prisma.workspace.findUnique.mockResolvedValue(establishmentWorkspace);
    prisma.subscription.findFirst.mockResolvedValue(subscriptionRow());
    prisma.workspaceMembership.count.mockResolvedValue(4);

    const result = await service.getEntitlements('workspace-est');

    expect(prisma.workspaceMembership.count).toHaveBeenCalledWith({
      where: {
        role: 'DOCTOR',
        status: 'ACTIVE',
        user: { accountStatus: { notIn: ['SUSPENDED', 'REJECTED'] } },
        workspaceId: 'workspace-est',
      },
    });
    expect(result.usage.doctors).toBe(4);
  });

  it('counts the AI analyses of the month in Algiers, technical failures aside', async () => {
    const { prisma, service } = setup();
    prisma.workspace.findUnique.mockResolvedValue(privateWorkspace);
    prisma.subscription.findFirst.mockResolvedValue(subscriptionRow());
    prisma.aiAnalysisRun.count.mockResolvedValue(7);

    const result = await service.getEntitlements('workspace-private');

    expect(prisma.aiAnalysisRun.count).toHaveBeenCalledWith({
      where: {
        createdAt: { gte: new Date('2026-09-30T23:00:00.000Z') },
        patient: { workspaceId: 'workspace-private' },
        status: { not: 'FAILED' },
      },
    });
    expect(result.usage.aiAnalysesThisMonth).toBe(7);
  });

  it('starts the month at midnight of the 1st in Algiers, not in UTC', async () => {
    jest.setSystemTime(new Date('2026-10-31T23:30:00.000Z'));
    const { prisma, service } = setup();
    prisma.workspace.findUnique.mockResolvedValue(privateWorkspace);
    prisma.subscription.findFirst.mockResolvedValue(
      subscriptionRow({ expiresAt: day(40) }),
    );

    await service.getEntitlements('workspace-private');

    // 00:30 on 1 November in Algiers: November has just begun.
    expect(prisma.aiAnalysisRun.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        createdAt: { gte: new Date('2026-10-31T23:00:00.000Z') },
      }),
    });
  });

  it('counts the AI analyses of a trial over the whole trial', async () => {
    const { prisma, service } = setup();
    const startedAt = new Date('2026-10-08T10:00:00.000Z');
    prisma.workspace.findUnique.mockResolvedValue(privateWorkspace);
    prisma.subscription.findFirst.mockResolvedValue(
      subscriptionRow({
        startedAt,
        status: SubscriptionStatus.TRIALING,
        trial: true,
      }),
    );

    const result = await service.getEntitlements('workspace-private');

    expect(prisma.aiAnalysisRun.count).toHaveBeenCalledWith({
      where: expect.objectContaining({ createdAt: { gte: startedAt } }),
    });
    expect(result.quotas.aiAnalysesPerMonth).toBe(10);
  });
});

describe('EntitlementsService.withQuota', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now);
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  function readySetup(subscription = subscriptionRow()) {
    const context = setup();
    context.prisma.workspace.findUnique.mockResolvedValue(privateWorkspace);
    context.prisma.subscription.findFirst.mockResolvedValue(subscription);
    return context;
  }

  it('locks the subscription, counts, then creates, in one transaction', async () => {
    const { prisma, service } = readySetup();
    prisma.aiAnalysisRun.count.mockResolvedValue(3);
    const run = jest.fn().mockResolvedValue({ id: 'run-1' });

    const result = await service.withQuota(
      'workspace-private',
      'aiAnalysesPerMonth',
      run,
      { pipeline: 'brain' },
    );

    expect(result).toEqual({ id: 'run-1' });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const [sqlParts, ...values] = prisma.$queryRaw.mock.calls[0] as [
      TemplateStringsArray,
      ...unknown[],
    ];
    expect(sqlParts.join('?')).toContain('FROM subscriptions');
    expect(sqlParts.join('?')).toContain('FOR UPDATE');
    expect(values).toEqual(['doctor-1']);
    // Lock, then the reads that count, then the creation.
    const order = (mock: jest.Mock) => mock.mock.invocationCallOrder[0];
    expect(order(prisma.$queryRaw)).toBeLessThan(
      order(prisma.subscription.findFirst),
    );
    expect(order(prisma.$queryRaw)).toBeLessThan(
      order(prisma.aiAnalysisRun.count),
    );
    expect(order(prisma.aiAnalysisRun.count)).toBeLessThan(order(run));
    // The run goes in the transaction's own client.
    expect(run).toHaveBeenCalledWith(prisma);
  });

  it('refuses at the limit with QUOTA_EXCEEDED, the figures, and creates nothing', async () => {
    const { prisma, service } = readySetup(
      subscriptionRow({ status: SubscriptionStatus.TRIALING, trial: true }),
    );
    prisma.aiAnalysisRun.count.mockResolvedValue(10);
    const run = jest.fn();

    const error = await errorOf(
      service.withQuota('workspace-private', 'aiAnalysesPerMonth', run),
    );

    expect((error as HttpException).getStatus()).toBe(403);
    // A trial's quota says so: it is counted over the whole trial.
    expect(bodyOf(error)).toMatchObject({
      code: 'QUOTA_EXCEEDED',
      limit: 10,
      quota: 'aiAnalysesPerMonth',
      trial: true,
      used: 10,
    });
    expect(run).not.toHaveBeenCalled();
  });

  it('lets the last free place through', async () => {
    const { prisma, service } = readySetup(
      subscriptionRow({ status: SubscriptionStatus.TRIALING, trial: true }),
    );
    prisma.aiAnalysisRun.count.mockResolvedValue(9);
    const run = jest.fn().mockResolvedValue('ok');

    await expect(
      service.withQuota('workspace-private', 'aiAnalysesPerMonth', run),
    ).resolves.toBe('ok');
  });

  it('never refuses an unlimited quota', async () => {
    const { prisma, service } = readySetup();
    prisma.patient.count.mockResolvedValue(1_000_000);

    await expect(
      service.withQuota('workspace-private', 'maxPatients', () =>
        Promise.resolve('ok'),
      ),
    ).resolves.toBe('ok');
  });

  it('refuses a pipeline outside the plan before looking at the quota', async () => {
    const { prisma, service } = readySetup();
    prisma.aiAnalysisRun.count.mockResolvedValue(100);
    const run = jest.fn();

    const error = await errorOf(
      service.withQuota('workspace-private', 'aiAnalysesPerMonth', run, {
        pipeline: 'cardio-seg-mri',
      }),
    );

    expect((error as HttpException).getStatus()).toBe(403);
    expect(bodyOf(error)).toMatchObject({
      code: 'AI_PIPELINE_NOT_IN_PLAN',
      pipeline: 'cardio-seg-mri',
    });
    expect(run).not.toHaveBeenCalled();
  });

  it('opens every pipeline during a trial', async () => {
    const { service } = readySetup(
      subscriptionRow({ status: SubscriptionStatus.TRIALING, trial: true }),
    );

    await expect(
      service.withQuota(
        'workspace-private',
        'aiAnalysesPerMonth',
        () => Promise.resolve('ok'),
        { pipeline: 'cardio-seg-mri' },
      ),
    ).resolves.toBe('ok');
  });

  it.each([
    [SubscriptionStatus.EXPIRED, day(-2)],
    [SubscriptionStatus.CANCELED, day(5)],
    // Past its end, not yet marked expired by the hourly job.
    [SubscriptionStatus.ACTIVE, day(-1)],
  ])(
    'refuses with SUBSCRIPTION_INACTIVE when the subscription is %s',
    async (status, expiresAt) => {
      const { service } = readySetup(subscriptionRow({ expiresAt, status }));
      const run = jest.fn();

      const error = await errorOf(
        service.withQuota('workspace-private', 'maxPatients', run),
      );

      expect((error as HttpException).getStatus()).toBe(403);
      expect(codeOf(error)).toBe('SUBSCRIPTION_INACTIVE');
      expect(bodyOf(error)).toMatchObject({
        expiresAt,
        status: status === 'ACTIVE' ? 'EXPIRED' : status,
      });
      expect(run).not.toHaveBeenCalled();
    },
  );

  it('refuses without any subscription', async () => {
    const { prisma, service } = setup();
    prisma.workspace.findUnique.mockResolvedValue(privateWorkspace);
    prisma.subscription.findFirst.mockResolvedValue(null);

    const error = await errorOf(
      service.withQuota('workspace-private', 'maxPatients', jest.fn()),
    );

    expect(bodyOf(error)).toMatchObject({
      code: 'SUBSCRIPTION_INACTIVE',
      status: 'NO_PLAN',
    });
  });

  it('refuses a workspace whose owner cannot be found', async () => {
    const { prisma, service } = setup();
    prisma.workspace.findUnique.mockResolvedValue(null);

    const error = await errorOf(
      service.withQuota('ghost', 'maxPatients', jest.fn()),
    );

    expect(codeOf(error)).toBe('SUBSCRIPTION_INACTIVE');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('counts only what the quota asks for', async () => {
    const { prisma, service } = readySetup();

    await service.withQuota('workspace-private', 'maxPatients', () =>
      Promise.resolve(null),
    );

    expect(prisma.patient.count).toHaveBeenCalledTimes(1);
    expect(prisma.aiAnalysisRun.count).not.toHaveBeenCalled();
    expect(prisma.workspaceMembership.count).not.toHaveBeenCalled();
  });
});

describe('assertQuotaAvailable', () => {
  const entitlements = (
    overrides: Partial<Entitlements> = {},
  ): Entitlements => ({
    daysLeft: 10,
    expiresAt: day(10),
    plan: { code: 'EST_BASIC_CLINIC', custom: false, id: 'p', name: 'Basic' },
    quotas: {
      aiAnalysesPerMonth: 100,
      aiPipelines: null,
      maxDoctors: 5,
      maxPatients: 500,
    },
    readOnly: false,
    status: SubscriptionStatus.ACTIVE,
    trial: false,
    usage: { aiAnalysesThisMonth: 0, doctors: 0, patients: 0 },
    ...overrides,
  });

  it.each([
    ['maxPatients', { patients: 500 }, 500],
    ['maxDoctors', { doctors: 5 }, 5],
    ['aiAnalysesPerMonth', { aiAnalysesThisMonth: 100 }, 100],
  ] as const)('refuses %s once the limit is reached', (quota, usage, limit) => {
    const full = entitlements({
      usage: {
        aiAnalysesThisMonth: 0,
        doctors: 0,
        patients: 0,
        ...usage,
      },
    });

    let thrown: unknown;
    try {
      assertQuotaAvailable(full, quota);
    } catch (error) {
      thrown = error;
    }

    expect(bodyOf(thrown)).toMatchObject({
      code: 'QUOTA_EXCEEDED',
      limit,
      quota,
      used: limit,
    });
  });

  it('lets a request through below the limit', () => {
    expect(() =>
      assertQuotaAvailable(
        entitlements({
          usage: { aiAnalysesThisMonth: 99, doctors: 4, patients: 499 },
        }),
        'maxPatients',
      ),
    ).not.toThrow();
  });
});
