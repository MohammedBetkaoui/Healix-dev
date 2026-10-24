import { BadRequestException, type HttpException } from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { AdminJwtGuard } from '../../admin-auth/guards/admin-jwt.guard';
import { AdminAiMonitoringController } from '../../admin/ai-monitoring/admin-ai-monitoring.controller';
import { AdminAiMonitoringService } from '../../admin/ai-monitoring/admin-ai-monitoring.service';
import { REQUIRES_ACTIVE_SUBSCRIPTION_KEY } from '../../common/decorators/requires-active-subscription.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { type PatientsService } from '../../patients/patients.service';
import { type PrismaService } from '../../prisma/prisma.service';
import { AiAnalysisRunsController } from '../ai-analysis-runs.controller';
import { type AiAnalysisRunsService } from '../ai-analysis-runs.service';
import { AiRunsOverviewController } from '../overview/ai-runs-overview.controller';
import { AiRunsOverviewService } from '../overview/ai-runs-overview.service';
import { ModelMonitoringQueryDto } from './model-monitoring.dto';

const doctor = {
  email: 'doctor-a@healix.dz',
  role: UserRole.INDEPENDENT_DOCTOR,
  sub: 'doctor-a',
  tokenType: 'access' as const,
};

function fakePrisma() {
  const findMany = jest.fn().mockResolvedValue([]);
  return {
    findMany,
    prisma: { aiAnalysisRun: { findMany } } as unknown as PrismaService,
  };
}

const whereOf = (findMany: jest.Mock) =>
  (
    findMany.mock.calls[0] as [
      {
        where: { AND: Record<string, unknown>[] };
        select: Record<string, boolean>;
      },
    ]
  )[0];

async function errorOf(promise: Promise<unknown>): Promise<HttpException> {
  try {
    await promise;
  } catch (error) {
    return error as HttpException;
  }
  throw new Error('expected an error');
}

describe('GET /ai-analysis-runs/model-monitoring', () => {
  const patients = {
    getPatientScopeWhere: jest.fn().mockResolvedValue({ workspaceId: 'ws-a' }),
  };

  it("reads the runs of the caller's patients only, the scope first", async () => {
    const { findMany, prisma } = fakePrisma();
    const service = new AiRunsOverviewService(
      prisma,
      patients as unknown as PatientsService,
      {} as AiAnalysisRunsService,
    );

    await service.modelMonitoring(doctor, {});

    const { where } = whereOf(findMany);
    expect(patients.getPatientScopeWhere).toHaveBeenCalledWith(doctor);
    expect(where.AND[0]).toEqual({ patient: { workspaceId: 'ws-a' } });
    expect(where.AND[1]).toHaveProperty('createdAt');
  });

  it('reads the fields the board needs and nothing about the patient', async () => {
    const { findMany, prisma } = fakePrisma();
    const service = new AiRunsOverviewService(
      prisma,
      patients as unknown as PatientsService,
      {} as AiAnalysisRunsService,
    );

    await service.modelMonitoring(doctor, {});

    const { select } = whereOf(findMany);
    expect(Object.keys(select).sort()).toEqual([
      'classificationModelId',
      'createdAt',
      'decidedAt',
      'decisionLabel',
      'decisionStatus',
      'durationMs',
      'modelDecision',
      'pipeline',
      'predictions',
      'segmentationModelId',
      'status',
    ]);
  });

  it('reads the three months before the first month asked for, for the baseline', async () => {
    const { findMany, prisma } = fakePrisma();
    const service = new AiRunsOverviewService(
      prisma,
      patients as unknown as PatientsService,
      {} as AiAnalysisRunsService,
    );

    await service.modelMonitoring(doctor, {
      from: '2026-05-20T10:00:00.000Z',
      to: '2026-08-02T10:00:00.000Z',
    });

    const range = whereOf(findMany).where.AND[1].createdAt as {
      gte: Date;
      lte: Date;
    };
    // February 1st, midnight in Algiers (UTC+1).
    expect(range.gte.toISOString()).toBe('2026-01-31T23:00:00.000Z');
    expect(range.lte.toISOString()).toBe('2026-08-02T10:00:00.000Z');
  });

  it('answers the board of its period', async () => {
    const { prisma } = fakePrisma();
    const service = new AiRunsOverviewService(
      prisma,
      patients as unknown as PatientsService,
      {} as AiAnalysisRunsService,
    );

    const board = await service.modelMonitoring(doctor, {
      from: '2026-05-20T10:00:00.000Z',
      to: '2026-08-02T10:00:00.000Z',
    });

    expect(board).toMatchObject({
      models: [],
      period: {
        from: '2026-04-30T23:00:00.000Z',
        to: '2026-08-02T10:00:00.000Z',
      },
      timeZone: 'Africa/Algiers',
    });
  });

  it('refuses a period that ends before it starts, and one over 24 months, without reading anything', async () => {
    const { findMany, prisma } = fakePrisma();
    const service = new AiRunsOverviewService(
      prisma,
      patients as unknown as PatientsService,
      {} as AiAnalysisRunsService,
    );

    const inverted = await errorOf(
      service.modelMonitoring(doctor, {
        from: '2026-09-01T00:00:00Z',
        to: '2026-08-01T00:00:00Z',
      }),
    );
    const tooLong = await errorOf(
      service.modelMonitoring(doctor, {
        from: '2023-01-01T00:00:00Z',
        to: '2026-01-01T00:00:00Z',
      }),
    );

    expect(inverted).toBeInstanceOf(BadRequestException);
    expect(inverted.getResponse()).toMatchObject({
      code: 'AI_RUNS_INVALID_PERIOD',
    });
    expect(tooLong.getResponse()).toMatchObject({
      code: 'AI_MONITORING_PERIOD_TOO_LONG',
    });
    expect(findMany).not.toHaveBeenCalled();
  });
});

describe('GET /admin/ai-analysis-runs/model-monitoring', () => {
  it('reads every workspace: no patient scope', async () => {
    const { findMany, prisma } = fakePrisma();

    await new AdminAiMonitoringService(prisma).modelMonitoring({});

    const { where } = whereOf(findMany);
    expect(where.AND[0]).toEqual({});
    expect(where.AND[1]).toHaveProperty('createdAt');
  });

  it('refuses the same bad periods', async () => {
    const { prisma } = fakePrisma();
    const service = new AdminAiMonitoringService(prisma);

    const error = await errorOf(
      service.modelMonitoring({
        from: '2026-09-01T00:00:00Z',
        to: '2026-08-01T00:00:00Z',
      }),
    );

    expect(error.getResponse()).toMatchObject({
      code: 'AI_RUNS_INVALID_PERIOD',
    });
  });
});

describe('the routes', () => {
  // The method of a controller as a value to read metadata from, without
  // taking it off its object.
  const handlerOf = (controller: object, method: string): object =>
    (controller as { prototype: Record<string, object> }).prototype[method];
  const routeOf = (controller: object, method: string) => ({
    method: Reflect.getMetadata(
      METHOD_METADATA,
      handlerOf(controller, method),
    ) as RequestMethod,
    path: Reflect.getMetadata(
      PATH_METADATA,
      handlerOf(controller, method),
    ) as string,
  });

  it('serves the workspace board under the tracking routes', () => {
    expect(Reflect.getMetadata(PATH_METADATA, AiRunsOverviewController)).toBe(
      'ai-analysis-runs',
    );
    expect(routeOf(AiRunsOverviewController, 'modelMonitoring')).toEqual({
      method: RequestMethod.GET,
      path: 'model-monitoring',
    });
  });

  it('serves the global board under the back-office, behind the admin guard and roles', () => {
    expect(
      Reflect.getMetadata(PATH_METADATA, AdminAiMonitoringController),
    ).toBe('admin/ai-analysis-runs');
    expect(routeOf(AdminAiMonitoringController, 'modelMonitoring')).toEqual({
      method: RequestMethod.GET,
      path: 'model-monitoring',
    });
    expect(
      Reflect.getMetadata(GUARDS_METADATA, AdminAiMonitoringController),
    ).toContain(AdminJwtGuard);
    expect(Reflect.getMetadata('roles', AdminAiMonitoringController)).toEqual([
      UserRole.SUPER_ADMIN,
      UserRole.ADMIN_VERIFICATION,
    ]);
  });

  it('is a read: open without an active subscription, like the tracking', () => {
    // The mark is what a write carries (the control), and the board has none.
    expect(
      Reflect.getMetadata(
        REQUIRES_ACTIVE_SUBSCRIPTION_KEY,
        handlerOf(AiAnalysisRunsController, 'create'),
      ),
    ).toBe(true);
    expect(
      Reflect.getMetadata(
        REQUIRES_ACTIVE_SUBSCRIPTION_KEY,
        handlerOf(AiRunsOverviewController, 'modelMonitoring'),
      ),
    ).toBeUndefined();
    expect(
      Reflect.getMetadata(
        REQUIRES_ACTIVE_SUBSCRIPTION_KEY,
        AiRunsOverviewController,
      ),
    ).toBeUndefined();
  });
});

describe('the query', () => {
  const check = (query: Record<string, string>) =>
    validate(plainToInstance(ModelMonitoringQueryDto, query));

  it('takes an ISO period, both ends optional', async () => {
    expect(await check({})).toHaveLength(0);
    expect(await check({ from: '2026-01-01T00:00:00.000Z' })).toHaveLength(0);
    expect(
      await check({ from: '2026-01-01', to: '2026-12-31T23:00:00.000Z' }),
    ).toHaveLength(0);
  });

  it('refuses what is not a date', async () => {
    expect(await check({ from: 'last year' })).toHaveLength(1);
    expect(await check({ to: '2026-13-45' })).toHaveLength(1);
  });
});
