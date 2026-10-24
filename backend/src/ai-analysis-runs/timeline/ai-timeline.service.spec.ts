import { NotFoundException, RequestMethod } from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { REQUIRES_ACTIVE_SUBSCRIPTION_KEY } from '../../common/decorators/requires-active-subscription.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { VerifiedAccountGuard } from '../../common/guards/verified-account.guard';
import { type PatientsService } from '../../patients/patients.service';
import { type PrismaService } from '../../prisma/prisma.service';
import { AiTimelineController } from './ai-timeline.controller';
import { AiTimelineQueryDto } from './ai-timeline.dto';
import { AiTimelineService } from './ai-timeline.service';
import { TIMELINE_RUN_SELECT } from './ai-timeline';

const doctor = {
  email: 'doctor-a@healix.dz',
  role: UserRole.INDEPENDENT_DOCTOR,
  sub: 'doctor-a',
  tokenType: 'access' as const,
};

function setup(
  scope: () => Promise<unknown> = () => Promise.resolve({ id: 'patient-1' }),
) {
  const findMany = jest.fn().mockResolvedValue([]);
  const getPatientInScope = jest.fn().mockImplementation(scope);
  const service = new AiTimelineService(
    { aiAnalysisRun: { findMany } } as unknown as PrismaService,
    { getPatientInScope } as unknown as PatientsService,
  );
  return { findMany, getPatientInScope, service };
}

describe('GET /patients/:id/ai-timeline', () => {
  it('reads the SUCCEEDED runs of that patient and that chain, oldest first', async () => {
    const { findMany, service } = setup();

    await service.timeline(doctor, 'patient-1', 'brain');

    expect(findMany).toHaveBeenCalledWith({
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: TIMELINE_RUN_SELECT,
      where: { patientId: 'patient-1', pipeline: 'brain', status: 'SUCCEEDED' },
    });
  });

  it('checks the patient is in the workspace of the caller before reading anything', async () => {
    const { getPatientInScope, service } = setup();

    await service.timeline(doctor, 'patient-1', 'cardio-ecg');

    expect(getPatientInScope).toHaveBeenCalledWith(doctor, 'patient-1');
  });

  it('answers 404 for a patient of another workspace, and reads no run', async () => {
    const { findMany, service } = setup(() =>
      Promise.reject(new NotFoundException('Patient introuvable.')),
    );

    await expect(
      service.timeline(doctor, 'patient-of-someone-else', 'brain'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('answers the timeline of the patient and the chain asked', async () => {
    const { service } = setup();

    await expect(
      service.timeline(doctor, 'patient-1', 'pathology-breast'),
    ).resolves.toMatchObject({
      items: [],
      patientId: 'patient-1',
      pipeline: 'pathology-breast',
    });
  });
});

describe('the route', () => {
  const handler = (
    AiTimelineController.prototype as unknown as Record<string, object>
  ).timeline;

  it('is GET /patients/:id/ai-timeline', () => {
    expect(Reflect.getMetadata(PATH_METADATA, AiTimelineController)).toBe(
      'patients/:id/ai-timeline',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
      RequestMethod.GET,
    );
  });

  it('has the guards of the patient record: signed in, role, verified account', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      AiTimelineController,
    ) as unknown[];

    expect(guards).toContain(JwtAuthGuard);
    expect(guards).toContain(VerifiedAccountGuard);
  });

  it('is a read: open without a live subscription, like the record', () => {
    expect(
      Reflect.getMetadata(REQUIRES_ACTIVE_SUBSCRIPTION_KEY, handler),
    ).toBeUndefined();
    expect(
      Reflect.getMetadata(
        REQUIRES_ACTIVE_SUBSCRIPTION_KEY,
        AiTimelineController,
      ),
    ).toBeUndefined();
  });
});

describe('the query', () => {
  const check = (query: Record<string, string>) =>
    validate(plainToInstance(AiTimelineQueryDto, query));

  it('takes each of the five chains', async () => {
    for (const pipeline of [
      'brain',
      'pathology-breast',
      'pathology-nuclei',
      'cardio-ecg',
      'cardio-seg-mri',
    ]) {
      expect(await check({ pipeline })).toHaveLength(0);
    }
  });

  it('needs the chain: measures of two chains share nothing', async () => {
    expect(await check({})).toHaveLength(1);
    expect(await check({ pipeline: '' })).toHaveLength(1);
  });

  it('refuses a chain it does not know', async () => {
    expect(await check({ pipeline: 'cardiology' })).toHaveLength(1);
    expect(await check({ pipeline: 'BRAIN' })).toHaveLength(1);
  });
});
