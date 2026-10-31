import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import {
  AiAnalysisRunStatus,
  AiRunDecision,
  ConsultationStatus,
} from '@prisma/client';

import {
  assertTestDatabaseName,
  IntegrationFixtures,
  readTestDatabase,
} from '../common/testing/integration-fixtures';
import { UserRole } from '../common/enums/user-role.enum';
import {
  OFFLINE_CAPABILITIES,
  type OfflineActor,
  type OfflineScope,
} from '../offline-devices/offline-device.types';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { AI_REPORTS_PER_PATIENT } from './ai-report-sync';
import { OfflineScopeService } from './offline-scope.service';
import { PrescriptionSyncService } from './prescription-sync.service';
import { SyncService } from './sync.service';

// GET /sync/ai-reports against its real queries: the scope of the device, the
// workspace, the status and decision filters, the cap of 20 per patient, and
// the audit event. TEST_DATABASE_URL names a database ending in "_test"; the
// spec is skipped without it.
const database = readTestDatabase();
const describeWithDatabase = database ? describe : describe.skip;

describeWithDatabase('GET /sync/ai-reports', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let sync: SyncService;
  let fixtures: IntegrationFixtures;
  const patientIds: string[] = [];

  beforeAll(async () => {
    assertTestDatabaseName(database!);
    process.env.DATABASE_URL = database!.url;
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ ignoreEnvFile: true, isGlobal: true }),
        PrismaModule,
      ],
      providers: [
        SyncService,
        OfflineScopeService,
        { provide: PrescriptionSyncService, useValue: {} },
      ],
    }).compile();
    await moduleRef.init();
    prisma = moduleRef.get(PrismaService);
    sync = moduleRef.get(SyncService);
    fixtures = new IntegrationFixtures(prisma, 'sync-ai-reports');
  });

  afterAll(async () => {
    // Runs and their documents fence the patient and the user in (Restrict).
    await prisma.aiAnalysisRun.deleteMany({
      where: { patientId: { in: patientIds } },
    });
    await prisma.patientDocument.deleteMany({
      where: { patientId: { in: patientIds } },
    });
    await fixtures.cleanup();
    await moduleRef.close();
  });

  const independentScope: OfflineScope = {
    policy: 'PRIVATE_PRACTICE_ACTIVE',
    recentConsultationDays: 30,
    upcomingAppointmentDays: 30,
  };
  const assignedScope: OfflineScope = {
    policy: 'ASSIGNED_CLINICAL_RELATIONSHIP',
    recentConsultationDays: 30,
    upcomingAppointmentDays: 30,
  };

  const actorFor = (
    user: { id: string; role: string },
    workspaceId: string,
    offlineScope: OfflineScope,
  ): OfflineActor => ({
    grantId: 'grant-ai-reports',
    userId: user.id,
    deviceId: 'device-ai-reports',
    workspaceId,
    role: user.role as UserRole,
    offlineCapabilities: OFFLINE_CAPABILITIES,
    offlineScope,
  });

  const seedPatient = async (workspaceId: string, doctorProfileId: string) => {
    const patient = await fixtures.patient(workspaceId, doctorProfileId);
    patientIds.push(patient.id);
    return patient;
  };

  const seedRun = async (
    patient: { id: string },
    uploadedById: string,
    options: {
      day?: number;
      minute?: number;
      status?: AiAnalysisRunStatus;
      decision?: AiRunDecision | null;
    } = {},
  ) => {
    const n = fixtures.next();
    const document = await prisma.patientDocument.create({
      data: {
        patientId: patient.id,
        documentType: 'MEDICAL_IMAGE',
        originalName: `irm-${n}.png`,
        storedName: `irm-${fixtures.suffix}-${n}.png`,
        mimeType: 'image/png',
        size: 10,
        uploadedById,
      },
    });
    const decision =
      options.decision === undefined
        ? AiRunDecision.VALIDATED
        : options.decision;
    return prisma.aiAnalysisRun.create({
      data: {
        patientId: patient.id,
        sourceDocumentId: document.id,
        pipeline: 'brain',
        status: options.status ?? AiAnalysisRunStatus.SUCCEEDED,
        predictions: [{ label: 'glioma', probability: 0.9 }],
        classificationModelId: 'brain-test',
        maskPath: 'patients/x/ai-masks/secret.png',
        requestedById: uploadedById,
        decisionStatus: decision,
        decisionLabel: decision ? 'glioma' : null,
        decidedById: decision ? uploadedById : null,
        decidedAt: decision
          ? new Date(
              Date.UTC(2026, 9, options.day ?? 20, 10, options.minute ?? 0),
            )
          : null,
      },
    });
  };

  it('returns the validated and corrected analyses of the workspace, never the files', async () => {
    const doctor = await fixtures.independentDoctor();
    const patient = await seedPatient(doctor.workspace.id, doctor.profile.id);
    const validated = await seedRun(patient, doctor.user.id, { day: 20 });
    const corrected = await seedRun(patient, doctor.user.id, {
      day: 21,
      decision: AiRunDecision.CORRECTED,
    });
    await seedRun(patient, doctor.user.id, {
      decision: AiRunDecision.REJECTED,
    });
    await seedRun(patient, doctor.user.id, { decision: null });
    await seedRun(patient, doctor.user.id, {
      status: AiAnalysisRunStatus.FAILED,
      decision: null,
    });

    const answer = await sync.aiReports(
      actorFor(doctor.user, doctor.workspace.id, independentScope),
    );
    expect(answer.runIds).toEqual([corrected.id, validated.id]);
    expect(JSON.stringify(answer)).not.toContain('secret.png');
  });

  it('leaves out the patients of another workspace', async () => {
    const doctor = await fixtures.independentDoctor();
    const stranger = await fixtures.independentDoctor();
    const mine = await seedPatient(doctor.workspace.id, doctor.profile.id);
    const theirs = await seedPatient(
      stranger.workspace.id,
      stranger.profile.id,
    );
    const own = await seedRun(mine, doctor.user.id);
    await seedRun(theirs, stranger.user.id);

    const answer = await sync.aiReports(
      actorFor(doctor.user, doctor.workspace.id, independentScope),
    );
    expect(answer.runIds).toEqual([own.id]);
  });

  it('an affiliated doctor only receives the patients of their scope', async () => {
    const environment = await fixtures.establishmentWithDoctors(1);
    const doctor = environment.doctors[0];
    const inScope = await seedPatient(
      environment.workspace.id,
      doctor.profile.id,
    );
    const outOfScope = await seedPatient(
      environment.workspace.id,
      doctor.profile.id,
    );
    await prisma.patientConsultation.create({
      data: {
        workspaceId: environment.workspace.id,
        patientId: inScope.id,
        doctorProfileId: doctor.profile.id,
        createdById: doctor.user.id,
        status: ConsultationStatus.DRAFT,
      },
    });
    const visible = await seedRun(inScope, doctor.user.id);
    await seedRun(outOfScope, doctor.user.id);

    const answer = await sync.aiReports(
      actorFor(
        { id: doctor.user.id, role: UserRole.AFFILIATED_DOCTOR },
        environment.workspace.id,
        assignedScope,
      ),
    );
    expect(answer.runIds).toEqual([visible.id]);
  });

  it('keeps the 20 most recent analyses of a patient', async () => {
    const doctor = await fixtures.independentDoctor();
    const patient = await seedPatient(doctor.workspace.id, doctor.profile.id);
    const ids: string[] = [];
    for (let minute = 0; minute < AI_REPORTS_PER_PATIENT + 3; minute += 1) {
      ids.push((await seedRun(patient, doctor.user.id, { minute })).id);
    }

    const answer = await sync.aiReports(
      actorFor(doctor.user, doctor.workspace.id, independentScope),
    );
    expect(answer.runIds).toHaveLength(AI_REPORTS_PER_PATIENT);
    expect(answer.runIds).toEqual(ids.slice(3).reverse());
  });

  it('writes one audit event for the call', async () => {
    const doctor = await fixtures.independentDoctor();
    const patient = await seedPatient(doctor.workspace.id, doctor.profile.id);
    await seedRun(patient, doctor.user.id);

    await sync.aiReports(
      actorFor(doctor.user, doctor.workspace.id, independentScope),
    );
    const events = await prisma.auditLog.findMany({
      where: { userId: doctor.user.id, action: 'AI_REPORTS_READ_OFFLINE' },
    });
    expect(events).toHaveLength(1);
    expect(events[0].metadata).toMatchObject({
      deviceId: 'device-ai-reports',
      reportCount: 1,
    });
  });
});
