import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { ConsultationStatus, PatientAdministrativeStatus } from '@prisma/client';

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
import { OfflineScopeService } from './offline-scope.service';

// The server-authoritative scope, against its real queries: a patient may be
// kept offline only while a condition of the windows holds, and a patient the
// windows no longer cover stops being authorized even when an old
// consultation once earned him a place on the device.
// TEST_DATABASE_URL names a database ending in "_test"; the spec is skipped
// without it.
const database = readTestDatabase();
const describeWithDatabase = database ? describe : describe.skip;

describeWithDatabase('the authoritative offline patient scope', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let scope: OfflineScopeService;
  let fixtures: IntegrationFixtures;

  beforeAll(async () => {
    assertTestDatabaseName(database!);
    process.env.DATABASE_URL = database!.url;
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ ignoreEnvFile: true, isGlobal: true }),
        PrismaModule,
      ],
      providers: [OfflineScopeService],
    }).compile();
    await moduleRef.init();
    prisma = moduleRef.get(PrismaService);
    scope = moduleRef.get(OfflineScopeService);
    fixtures = new IntegrationFixtures(prisma, 'offline-scope');
  });

  afterAll(async () => {
    await fixtures.cleanup();
    await moduleRef.close();
  });

  const establishScope: OfflineScope = {
    policy: 'ASSIGNED_CLINICAL_RELATIONSHIP',
    recentConsultationDays: 30,
    upcomingAppointmentDays: 30,
  };
  const independentScope: OfflineScope = {
    policy: 'PRIVATE_PRACTICE_ACTIVE',
    recentConsultationDays: 30,
    upcomingAppointmentDays: 30,
  };

  const actorFor = (
    user: { id: string; role: string },
    workspaceId: string,
    offlineScope: OfflineScope,
  ): OfflineActor => ({
    grantId: 'grant-scope-test',
    userId: user.id,
    deviceId: 'device-scope-test',
    workspaceId,
    role: user.role as UserRole,
    offlineCapabilities: OFFLINE_CAPABILITIES,
    offlineScope,
  });

  // Direct rows: the scope reads the database, so its tests seed the database.
  const seedConsultation = (
    workspaceId: string,
    patientId: string,
    doctorProfileId: string,
    doctorUserId: string,
    options: { createdAt: Date; status: ConsultationStatus },
  ) =>
    prisma.patientConsultation.create({
      data: {
        workspaceId,
        patientId,
        doctorProfileId,
        createdById: doctorUserId,
        status: options.status,
        startedAt:
          options.status === ConsultationStatus.DRAFT ? null : options.createdAt,
        completedAt:
          options.status === ConsultationStatus.COMPLETED
            ? options.createdAt
            : null,
        completedById:
          options.status === ConsultationStatus.COMPLETED
            ? doctorUserId
            : null,
        createdAt: options.createdAt,
      },
    });

  describe('an affiliated doctor (ASSIGNED_CLINICAL_RELATIONSHIP)', () => {
    it('returns each condition of the windows separately, and nothing when they are over', async () => {
      const environment = await fixtures.establishmentWithDoctors(1);
      const doctor = environment.doctors[0];
      const actor = actorFor(
        doctor.user,
        environment.workspace.id,
        establishScope,
      );

      const recentConsultation = await fixtures.patient(
        environment.workspace.id,
        doctor.profile.id,
      );
      const staleConsultation = await fixtures.patient(
        environment.workspace.id,
        doctor.profile.id,
      );
      const openDraft = await fixtures.patient(
        environment.workspace.id,
        doctor.profile.id,
      );
      const upcomingAppointment = await fixtures.patient(
        environment.workspace.id,
        doctor.profile.id,
      );
      const farFutureAppointment = await fixtures.patient(
        environment.workspace.id,
        doctor.profile.id,
      );
      const recentPastAppointment = await fixtures.patient(
        environment.workspace.id,
        doctor.profile.id,
      );
      const expiredPastAppointment = await fixtures.patient(
        environment.workspace.id,
        doctor.profile.id,
      );
      const inactivePatient = await fixtures.patient(
        environment.workspace.id,
        doctor.profile.id,
      );
      // A patient of another workspace, with an otherwise in-window history.
      const elsewhere = await fixtures.establishmentWithDoctors(1);
      const strangerPatient = await fixtures.patient(
        elsewhere.workspace.id,
        elsewhere.doctors[0].profile.id,
      );

      const day = 86_400_000;
      const now = Date.now();
      await seedConsultation(
        environment.workspace.id,
        recentConsultation.id,
        doctor.profile.id,
        doctor.user.id,
        {
          createdAt: new Date(now - 3 * day),
          status: ConsultationStatus.COMPLETED,
        },
      );
      await seedConsultation(
        environment.workspace.id,
        staleConsultation.id,
        doctor.profile.id,
        doctor.user.id,
        {
          createdAt: new Date(now - 180 * day),
          status: ConsultationStatus.COMPLETED,
        },
      );
      await seedConsultation(
        environment.workspace.id,
        openDraft.id,
        doctor.profile.id,
        doctor.user.id,
        {
          createdAt: new Date(now - 180 * day),
          status: ConsultationStatus.DRAFT,
        },
      );
      await seedConsultation(
        environment.workspace.id,
        upcomingAppointment.id,
        doctor.profile.id,
        doctor.user.id,
        {
          createdAt: new Date(now - 180 * day),
          status: ConsultationStatus.COMPLETED,
        },
      );
      await fixtures.appointment(
        upcomingAppointment.id,
        doctor.profile.id,
        environment.owner.id,
        new Date(now + 7 * day),
      );
      await fixtures.appointment(
        farFutureAppointment.id,
        doctor.profile.id,
        environment.owner.id,
        new Date(now + 120 * day),
      );
      await fixtures.appointment(
        recentPastAppointment.id,
        doctor.profile.id,
        environment.owner.id,
        new Date(now - 5 * day),
      );
      await fixtures.appointment(
        expiredPastAppointment.id,
        doctor.profile.id,
        environment.owner.id,
        new Date(now - 90 * day),
      );
      await seedConsultation(
        environment.workspace.id,
        inactivePatient.id,
        doctor.profile.id,
        doctor.user.id,
        {
          createdAt: new Date(now - day),
          status: ConsultationStatus.COMPLETED,
        },
      );
      await prisma.patient.update({
        where: { id: inactivePatient.id },
        data: { administrativeStatus: PatientAdministrativeStatus.INACTIVE },
      });
      await prisma.patientConsultation.create({
        data: {
          workspaceId: elsewhere.workspace.id,
          patientId: strangerPatient.id,
          doctorProfileId: elsewhere.doctors[0].profile.id,
          createdById: elsewhere.doctors[0].user.id,
          status: ConsultationStatus.COMPLETED,
          startedAt: new Date(now - day),
          completedAt: new Date(now - day),
          completedById: elsewhere.doctors[0].user.id,
          createdAt: new Date(now - day),
        },
      });

      const resolved = await scope.resolve(actor);

      expect(resolved.policy).toBe('ASSIGNED_CLINICAL_RELATIONSHIP');
      // The authorized conditions each hold on their own.
      expect(resolved.patientIds).toContain(recentConsultation.id);
      expect(resolved.patientIds).toContain(openDraft.id);
      expect(resolved.patientIds).toContain(upcomingAppointment.id);
      expect(resolved.patientIds).toContain(recentPastAppointment.id);
      // Seeing a patient once, long ago, grants nothing anymore.
      expect(resolved.patientIds).not.toContain(staleConsultation.id);
      expect(resolved.patientIds).not.toContain(farFutureAppointment.id);
      expect(resolved.patientIds).not.toContain(expiredPastAppointment.id);
      // The administrative status still gates the windows.
      expect(resolved.patientIds).not.toContain(inactivePatient.id);
      // Another workspace is never part of this scope.
      expect(resolved.patientIds).not.toContain(strangerPatient.id);
    });

    it('drops a patient from the authorized set once his conditions expire', async () => {
      const environment = await fixtures.establishmentWithDoctors(1);
      const doctor = environment.doctors[0];
      const actor = actorFor(
        doctor.user,
        environment.workspace.id,
        establishScope,
      );
      const patient = await fixtures.patient(
        environment.workspace.id,
        doctor.profile.id,
      );
      const day = 86_400_000;
      const consultation = await seedConsultation(
        environment.workspace.id,
        patient.id,
        doctor.profile.id,
        doctor.user.id,
        {
          createdAt: new Date(Date.now() - 10 * day),
          status: ConsultationStatus.COMPLETED,
        },
      );

      const inScope = await scope.resolve(actor);
      expect(inScope.patientIds).toContain(patient.id);

      // The old consultation slides out of the window: the next resolve must
      // stop authorizing the patient. The desktop reconciles against this.
      await prisma.patientConsultation.update({
        where: { id: consultation.id },
        data: { createdAt: new Date(Date.now() - 120 * day) },
      });

      const afterExpiry = await scope.resolve(actor);
      expect(afterExpiry.patientIds).not.toContain(patient.id);
    });
  });

  describe('an independent doctor (PRIVATE_PRACTICE_ACTIVE)', () => {
    it('keeps the deliberate V1 cabinet policy: the doctor sees every administratively active patient of his workspace', async () => {
      const doctor = await fixtures.independentDoctor();
      const actor = actorFor(
        doctor.user,
        doctor.workspace.id,
        independentScope,
      );
      // Directory patients, with and without any recent contact.
      const directory = await fixtures.patient(
        doctor.workspace.id,
        doctor.profile.id,
      );
      const discharged = await fixtures.patient(
        doctor.workspace.id,
        doctor.profile.id,
      );
      await prisma.patient.update({
        where: { id: discharged.id },
        data: { administrativeStatus: PatientAdministrativeStatus.INACTIVE },
      });

      const resolved = await scope.resolve(actor);

      expect(resolved.policy).toBe('PRIVATE_PRACTICE_ACTIVE');
      expect(resolved.doctorProfileId).toBe(doctor.profile.id);
      expect(resolved.patientIds).toContain(directory.id);
      expect(resolved.patientIds).not.toContain(discharged.id);
    });
  });
});
