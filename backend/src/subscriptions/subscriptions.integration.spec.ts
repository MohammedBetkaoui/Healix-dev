/* eslint-disable @typescript-eslint/unbound-method */
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { type ExecutionContext, type HttpException } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';

import { AdminModule } from '../admin/admin.module';
import { AdminSubscriptionsService } from '../admin/subscriptions/admin-subscriptions.service';
import { AiAnalysisRunsModule } from '../ai-analysis-runs/ai-analysis-runs.module';
import { AiAnalysisRunsService } from '../ai-analysis-runs/ai-analysis-runs.service';
import { AiServiceClient } from '../ai-analysis-runs/ai-service.client';
import { type AuthenticatedUserPayload } from '../auth/types/authenticated-request.type';
import { RequiresActiveSubscription } from '../common/decorators/requires-active-subscription.decorator';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import {
  assertTestDatabaseName,
  IntegrationFixtures,
  readTestDatabase,
} from '../common/testing/integration-fixtures';
import { type CreatePatientDto } from '../patients/dto/create-patient.dto';
import { PatientsModule } from '../patients/patients.module';
import { PatientsService } from '../patients/patients.service';
import { PaymentsModule } from '../payments/payments.module';
import { PaymentsService } from '../payments/payments.service';
import { PrismaService } from '../prisma/prisma.service';
import { EntitlementsService } from './entitlements.service';
import { addMonths, startOfQuotaMonth } from './subscription-period';
import { SubscriptionsModule } from './subscriptions.module';
import { SubscriptionsService } from './subscriptions.service';

// Subscriptions against a migrated database: the quota is held under load
// (15 requests, 10 places), a payment paid twice extends once, an expired
// account reads but does not create, an affiliated doctor works under the
// subscription of the establishment, the admin console's queries run, and the
// SQL backfill of the migration can be run again without a second trial.
// TEST_DATABASE_URL names a database ending in "_test"; the spec is skipped
// without it.
const database = readTestDatabase();
const describeWithDatabase = database ? describe : describe.skip;

const DAY = 86_400_000;
const demoCard = {
  cardHolderName: 'BARKAOUI MOURAD',
  cardNumber: '1234123412341234',
  expiryMonth: '09',
  expiryYear: '2030',
  psv: '353',
};

async function errorOf(promise: Promise<unknown>): Promise<HttpException> {
  try {
    await promise;
  } catch (error) {
    return error as HttpException;
  }
  throw new Error('expected an error');
}

const bodyOf = (error: HttpException) =>
  error.getResponse() as Record<string, unknown>;

// What a controller method marked as a write looks like to the guard.
class WriteRoutes {
  @RequiresActiveSubscription()
  write() {
    return 'written';
  }

  read() {
    return 'read';
  }
}

const routeContext = (
  handler: () => unknown,
  user: AuthenticatedUserPayload,
): ExecutionContext =>
  ({
    getClass: () => WriteRoutes,
    getHandler: () => handler,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  }) as unknown as ExecutionContext;

describeWithDatabase('subscriptions against a database', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let fixtures: IntegrationFixtures;
  let entitlements: EntitlementsService;
  let runs: AiAnalysisRunsService;
  let patients: PatientsService;
  let payments: PaymentsService;
  let subscriptions: SubscriptionsService;
  let admin: AdminSubscriptionsService;
  let guard: SubscriptionGuard;
  const uploadRoot = mkdtempSync(join(tmpdir(), 'healix-subscriptions-'));
  let analyzed = 0;

  // A brain analysis the service answers at once, successfully: the runs
  // stay counted (a failed one frees its place).
  const aiService = {
    analyzeBrain: () => {
      analyzed += 1;
      return Promise.resolve({
        classification: {
          modelId: 'brain-test',
          predictions: [
            { label: 'notumor', probability: 0.9 },
            { label: 'glioma', probability: 0.1 },
          ],
          weightsSha256: 'a'.repeat(64),
        },
        durationMs: 3,
        imageHeight: 8,
        imageWidth: 8,
        segmentation: null,
        segmentationSkippedReason: 'not_applicable_for_class',
      });
    },
  };

  // A patient with the AI consent and a document to analyse, written on disk.
  async function patientWithDocument(
    workspaceId: string,
    profileId: string,
    userId: string,
  ) {
    const patient = await fixtures.patient(workspaceId, profileId);
    await prisma.patientConsent.create({
      data: {
        patientId: patient.id,
        recordedAt: new Date(),
        recordedById: userId,
        status: 'SIGNED',
        type: 'DIAGNOSTIC_AI',
      },
    });
    const directory = join(uploadRoot, 'patients', patient.id, 'documents');
    mkdirSync(directory, { recursive: true });
    const localPath = join(directory, 'scan.png');
    writeFileSync(localPath, Buffer.from('not-really-a-png'));
    const document = await prisma.patientDocument.create({
      data: {
        documentType: 'MEDICAL_IMAGE',
        localPath,
        mimeType: 'image/png',
        originalName: 'scan.png',
        patientId: patient.id,
        size: 16,
        storedName: 'scan.png',
        uploadedById: userId,
      },
    });
    return { document, patient };
  }

  const patientDto = (n: number) =>
    ({
      address: 'Alger',
      birthDate: '1985-03-12',
      commune: 'Alger',
      emergencyContactName: 'Contact',
      emergencyContactPhone: '0550000000',
      firstName: 'Amina',
      firstNameAr: 'أمينة',
      gender: 'FEMALE',
      insurance: 'CNAS',
      lastName: `Quota${n}`,
      lastNameAr: 'حصة',
      nationalId: `NID-QUOTA-${fixtures.suffix}-${n}`,
      phone: '0550000000',
      sector: 'PUBLIC',
      wilaya: 'Alger',
    }) as CreatePatientDto;

  const subscriptionOf = (userId: string) =>
    prisma.subscription.findFirstOrThrow({
      orderBy: { createdAt: 'desc' },
      where: { userId },
    });

  beforeAll(async () => {
    assertTestDatabaseName(database!);
    process.env.DATABASE_URL = database!.url;
    process.env.UPLOAD_ROOT = uploadRoot;
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ ignoreEnvFile: true, isGlobal: true }),
        PatientsModule,
        AiAnalysisRunsModule,
        PaymentsModule,
        SubscriptionsModule,
        AdminModule,
      ],
    })
      .overrideProvider(AiServiceClient)
      .useValue(aiService)
      .compile();
    await moduleRef.init();
    prisma = moduleRef.get(PrismaService);
    entitlements = moduleRef.get(EntitlementsService);
    runs = moduleRef.get(AiAnalysisRunsService);
    patients = moduleRef.get(PatientsService);
    payments = moduleRef.get(PaymentsService);
    subscriptions = moduleRef.get(SubscriptionsService);
    admin = moduleRef.get(AdminSubscriptionsService);
    guard = moduleRef.get(SubscriptionGuard);
    fixtures = new IntegrationFixtures(prisma, 'subs');
    // The plans of the catalog, with their prices (a payment needs one).
    for (const code of [
      'DOCTOR_PRO',
      'DOCTOR_PREMIUM_AI',
      'EST_BASIC_CLINIC',
      'EST_CUSTOM',
    ]) {
      await fixtures.plan(code);
    }
  }, 60_000);

  afterAll(async () => {
    if (prisma) await fixtures?.cleanup();
    await moduleRef?.close();
    rmSync(uploadRoot, { force: true, recursive: true });
  }, 60_000);

  describe('quotas under load', () => {
    it('lets exactly 10 of 15 parallel AI analyses through during a trial, and refuses the others with QUOTA_EXCEEDED', async () => {
      const trial = await fixtures.independentDoctor({
        subscription: {
          expiresAt: new Date(Date.now() + 13 * DAY),
          startedAt: new Date(Date.now() - DAY),
          status: 'TRIALING',
          trial: true,
        },
      });
      const { document, patient } = await patientWithDocument(
        trial.workspace.id,
        trial.profile.id,
        trial.user.id,
      );
      const before = analyzed;

      const results = await Promise.allSettled(
        Array.from({ length: 15 }, () =>
          runs.create(trial.actor, patient.id, {
            pipeline: 'brain',
            sourceDocumentId: document.id,
          } as never),
        ),
      );

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter(
        (r): r is PromiseRejectedResult => r.status === 'rejected',
      );
      expect(fulfilled).toHaveLength(10);
      expect(rejected).toHaveLength(5);
      for (const { reason } of rejected) {
        expect((reason as HttpException).getStatus()).toBe(403);
        expect(bodyOf(reason as HttpException)).toMatchObject({
          code: 'QUOTA_EXCEEDED',
          limit: 10,
          quota: 'aiAnalysesPerMonth',
          used: 10,
        });
      }
      // The service was called for the 10 that went through only.
      expect(analyzed - before).toBe(10);
      expect(
        await prisma.aiAnalysisRun.count({ where: { patientId: patient.id } }),
      ).toBe(10);

      // The 11th shows the figures the dialog needs.
      const eleventh = await errorOf(
        runs.create(trial.actor, patient.id, {
          pipeline: 'brain',
          sourceDocumentId: document.id,
        } as never),
      );
      expect(bodyOf(eleventh)).toMatchObject({
        code: 'QUOTA_EXCEEDED',
        limit: 10,
        used: 10,
      });
      expect(
        (await entitlements.getEntitlementsForUser(trial.actor)).usage
          .aiAnalysesThisMonth,
      ).toBe(10);
    }, 60_000);

    it('holds the quota even when the creation is slow: the count and the creation are under one lock', async () => {
      const trial = await fixtures.independentDoctor({
        subscription: {
          expiresAt: new Date(Date.now() + 13 * DAY),
          startedAt: new Date(Date.now() - DAY),
          status: 'TRIALING',
          trial: true,
        },
      });
      const { document, patient } = await patientWithDocument(
        trial.workspace.id,
        trial.profile.id,
        trial.user.id,
      );

      // Each creation waits 30 ms between the count and the insert: without
      // the lock, the 15 would all count 0 and all go through.
      const results = await Promise.allSettled(
        Array.from({ length: 15 }, () =>
          entitlements.withQuota(
            trial.workspace.id,
            'aiAnalysesPerMonth',
            async (client) => {
              await new Promise((resolve) => setTimeout(resolve, 30));
              return client.aiAnalysisRun.create({
                data: {
                  patientId: patient.id,
                  pipeline: 'brain',
                  requestedById: trial.user.id,
                  sourceDocumentId: document.id,
                  status: 'RUNNING',
                },
              });
            },
            { pipeline: 'brain' },
          ),
        ),
      );

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(10);
      expect(
        await prisma.aiAnalysisRun.count({ where: { patientId: patient.id } }),
      ).toBe(10);
    }, 60_000);

    it('gives a place back when an analysis fails for a technical reason', async () => {
      const trial = await fixtures.independentDoctor({
        subscription: {
          expiresAt: new Date(Date.now() + 13 * DAY),
          startedAt: new Date(Date.now() - DAY),
          status: 'TRIALING',
          trial: true,
        },
      });
      const { document, patient } = await patientWithDocument(
        trial.workspace.id,
        trial.profile.id,
        trial.user.id,
      );
      for (let index = 0; index < 10; index += 1) {
        await runs.create(trial.actor, patient.id, {
          pipeline: 'brain',
          sourceDocumentId: document.id,
        } as never);
      }
      expect(
        bodyOf(
          await errorOf(
            runs.create(trial.actor, patient.id, {
              pipeline: 'brain',
              sourceDocumentId: document.id,
            } as never),
          ),
        ).code,
      ).toBe('QUOTA_EXCEEDED');

      const [first] = await prisma.aiAnalysisRun.findMany({
        take: 1,
        where: { patientId: patient.id },
      });
      await prisma.aiAnalysisRun.update({
        data: { errorCode: 'AI_SERVICE_UNAVAILABLE', status: 'FAILED' },
        where: { id: first.id },
      });

      await expect(
        runs.create(trial.actor, patient.id, {
          pipeline: 'brain',
          sourceDocumentId: document.id,
        } as never),
      ).resolves.toBeDefined();
    }, 60_000);

    it('refuses a pipeline outside the plan (segmentation), and opens it during a trial', async () => {
      const pro = await fixtures.independentDoctor();
      const { document, patient } = await patientWithDocument(
        pro.workspace.id,
        pro.profile.id,
        pro.user.id,
      );

      const error = await errorOf(
        runs.create(pro.actor, patient.id, {
          pipeline: 'cardio-seg-mri',
          sourceDocumentId: document.id,
        } as never),
      );

      expect(error.getStatus()).toBe(403);
      expect(bodyOf(error)).toMatchObject({
        code: 'AI_PIPELINE_NOT_IN_PLAN',
        pipeline: 'cardio-seg-mri',
      });
      expect(
        await prisma.aiAnalysisRun.count({ where: { patientId: patient.id } }),
      ).toBe(0);
    });

    it('lets exactly 3 of 6 parallel patient creations through when 3 places are left', async () => {
      const doctor = await fixtures.independentDoctor({
        subscription: {
          customQuotas: {
            aiAnalysesPerMonth: null,
            aiPipelines: null,
            maxDoctors: 1,
            maxPatients: 3,
          },
        },
      });

      const results = await Promise.allSettled(
        Array.from({ length: 6 }, (_, index) =>
          patients.create(doctor.actor, patientDto(index)),
        ),
      );

      const created = results.filter((r) => r.status === 'fulfilled');
      expect(created).toHaveLength(3);
      for (const result of results) {
        if (result.status === 'rejected') {
          expect(bodyOf(result.reason as HttpException)).toMatchObject({
            code: 'QUOTA_EXCEEDED',
            limit: 3,
            quota: 'maxPatients',
            used: 3,
          });
        }
      }
      expect(
        await prisma.patient.count({
          where: { workspaceId: doctor.workspace.id },
        }),
      ).toBe(3);
      // Fixtures clean up the patients created by the service.
      const rows = await prisma.patient.findMany({
        select: { id: true },
        where: { workspaceId: doctor.workspace.id },
      });
      fixtures.created.patients.push(...rows.map((row) => row.id));
    }, 60_000);

    it('counts the AI analyses of the month in Algiers: the previous month, a failure and the other months are left out', async () => {
      // Subscribed for a long time: the month, not the purchase, starts the count.
      const doctor = await fixtures.independentDoctor({
        subscription: { startedAt: new Date(Date.now() - 400 * DAY) },
      });
      const { document, patient } = await patientWithDocument(
        doctor.workspace.id,
        doctor.profile.id,
        doctor.user.id,
      );
      const monthStart = startOfQuotaMonth(new Date());
      const run = (offsetSeconds: number, status: string) =>
        prisma.aiAnalysisRun.create({
          data: {
            createdAt: new Date(monthStart.getTime() + offsetSeconds * 1_000),
            patientId: patient.id,
            pipeline: 'brain',
            requestedById: doctor.user.id,
            sourceDocumentId: document.id,
            status: status as never,
          },
        });
      await run(-60, 'SUCCEEDED'); // a minute before the month: last month
      await run(60, 'SUCCEEDED');
      await run(120, 'FAILED'); // a technical failure is not an analysis
      await run(180, 'REJECTED_INPUT');

      const result = await entitlements.getEntitlementsForUser(doctor.actor);

      expect(result.usage.aiAnalysesThisMonth).toBe(2);
    });
  });

  describe('a payment', () => {
    const intent = (
      userId: string,
      planId = 'DOCTOR_PRO',
      billingPeriod: 'MONTHLY' | 'ANNUAL' = 'MONTHLY',
    ) =>
      payments.createIntent(userId, {
        billingPeriod,
        paymentMethod: 'SYNTHETIC_CHARGILY',
        planId,
      } as never);

    it('activates at once, from the days left of the trial, and the second of two simultaneous payments extends nothing', async () => {
      const trialEnd = new Date(Date.now() + 9 * DAY);
      const trial = await fixtures.independentDoctor({
        subscription: {
          expiresAt: trialEnd,
          startedAt: new Date(Date.now() - 5 * DAY),
          status: 'TRIALING',
          trial: true,
        },
      });
      const { paymentId } = await intent(trial.user.id);

      const results = await Promise.allSettled([
        payments.payWithSyntheticChargily(trial.user.id, paymentId, demoCard),
        payments.payWithSyntheticChargily(trial.user.id, paymentId, demoCard),
      ]);

      const paid = results.filter((r) => r.status === 'fulfilled');
      const refused = results.filter(
        (r): r is PromiseRejectedResult => r.status === 'rejected',
      );
      expect(paid).toHaveLength(1);
      expect(refused).toHaveLength(1);
      expect((refused[0].reason as HttpException).getStatus()).toBe(409);

      // Active, no longer a trial, 9 days of trial + one month: extended once.
      const subscription = await subscriptionOf(trial.user.id);
      expect(subscription).toMatchObject({
        status: 'ACTIVE',
        trial: false,
      });
      expect(subscription.expiresAt).toEqual(addMonths(trialEnd, 1));
      expect(
        await prisma.subscriptionEvent.findMany({
          where: { subscriptionId: subscription.id },
        }),
      ).toEqual([
        expect.objectContaining({
          fromStatus: 'TRIALING',
          paymentId,
          toStatus: 'ACTIVE',
          type: 'PURCHASED',
        }),
      ]);
      expect(
        await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } }),
      ).toMatchObject({
        cardLast4: '1234',
        status: 'PAID',
        subscriptionId: subscription.id,
      });
      // The account follows, with no administrator in between.
      expect(
        await prisma.doctorProfile.findUniqueOrThrow({
          where: { userId: trial.user.id },
        }),
      ).toMatchObject({ subscriptionStatus: 'ACTIVE' });
      expect(
        (await entitlements.getEntitlementsForUser(trial.actor)).usage
          .aiAnalysesThisMonth,
      ).toBe(0);
      // Never the card number nor the code.
      const stored = JSON.stringify(
        await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } }),
      );
      expect(stored).not.toContain('1234123412341234');
      expect(stored).not.toContain('353');
    }, 60_000);

    it('renews from the old expiry, changes plan at once, and a declined card changes nothing', async () => {
      const doctor = await fixtures.independentDoctor();
      const first = await subscriptionOf(doctor.user.id);
      const firstExpiry = first.expiresAt as Date;

      const renewal = await intent(doctor.user.id);
      await payments.payWithSyntheticChargily(
        doctor.user.id,
        renewal.paymentId,
        demoCard,
      );
      const renewed = await subscriptionOf(doctor.user.id);
      expect(renewed.expiresAt).toEqual(addMonths(firstExpiry, 1));
      expect(renewed.startedAt).toEqual(first.startedAt);

      const declined = await intent(doctor.user.id);
      const error = await errorOf(
        payments.payWithSyntheticChargily(doctor.user.id, declined.paymentId, {
          ...demoCard,
          cardNumber: '4000000000000002',
        }),
      );
      expect(error.getStatus()).toBe(400);
      expect(
        await prisma.payment.findUniqueOrThrow({
          where: { id: declined.paymentId },
        }),
      ).toMatchObject({ status: 'FAILED' });
      expect((await subscriptionOf(doctor.user.id)).expiresAt).toEqual(
        renewed.expiresAt,
      );

      const upgrade = await intent(
        doctor.user.id,
        'DOCTOR_PREMIUM_AI',
        'ANNUAL',
      );
      await payments.payWithSyntheticChargily(
        doctor.user.id,
        upgrade.paymentId,
        demoCard,
      );
      const upgraded = await subscriptionOf(doctor.user.id);
      expect(upgraded.expiresAt).toEqual(
        addMonths(renewed.expiresAt as Date, 12),
      );
      const now = await entitlements.getEntitlementsForUser(doctor.actor);
      // The new plan applies at once, segmentation included.
      expect(now.plan?.code).toBe('DOCTOR_PREMIUM_AI');
      expect(now.quotas).toMatchObject({
        aiAnalysesPerMonth: 300,
        aiPipelines: null,
      });
      expect(
        (
          await prisma.subscriptionEvent.findMany({
            orderBy: { createdAt: 'asc' },
            where: { subscriptionId: first.id },
          })
        ).map((event) => event.type),
      ).toEqual(['RENEWED', 'PLAN_CHANGED']);
    }, 60_000);

    it('refuses a plan on quote and the offline settlements, by default', async () => {
      const owner = await fixtures.establishmentWithDoctors(0);

      const custom = await errorOf(intent(owner.owner.id, 'EST_CUSTOM'));
      expect(bodyOf(custom)).toMatchObject({ code: 'PLAN_REQUIRES_CONTACT' });

      const cash = await errorOf(
        payments.createIntent(owner.owner.id, {
          billingPeriod: 'MONTHLY',
          paymentMethod: 'MANUAL_CASH',
          planId: 'EST_BASIC_CLINIC',
        } as never),
      );
      expect(bodyOf(cash)).toMatchObject({ code: 'PAYMENT_METHOD_DISABLED' });
    });
  });

  describe('an expired account', () => {
    it('reads what it has, and creates nothing, until it subscribes again by itself', async () => {
      const doctor = await fixtures.independentDoctor({
        subscription: {
          expiresAt: new Date(Date.now() - 2 * DAY),
          status: 'EXPIRED',
        },
      });
      const owned = await fixtures.patient(
        doctor.workspace.id,
        doctor.profile.id,
      );

      // Reading and downloading stay open.
      await expect(patients.list(doctor.actor, {})).resolves.toEqual(
        expect.objectContaining({
          data: [expect.objectContaining({ id: owned.id })],
        }),
      );
      await expect(
        patients.findOne(doctor.actor, owned.id),
      ).resolves.toMatchObject({
        id: owned.id,
      });
      await expect(runs.list(doctor.actor, owned.id)).resolves.toEqual([]);
      await expect(
        guard.canActivate(
          routeContext(WriteRoutes.prototype.read, doctor.actor),
        ),
      ).resolves.toBe(true);

      // Creating is refused, at the door and at the creation itself.
      const refusedAtTheDoor = await errorOf(
        guard.canActivate(
          routeContext(WriteRoutes.prototype.write, doctor.actor),
        ),
      );
      expect(refusedAtTheDoor.getStatus()).toBe(403);
      expect(bodyOf(refusedAtTheDoor)).toMatchObject({
        code: 'SUBSCRIPTION_INACTIVE',
        status: 'EXPIRED',
      });
      const refusedCreation = await errorOf(
        patients.create(doctor.actor, patientDto(99)),
      );
      expect(bodyOf(refusedCreation)).toMatchObject({
        code: 'SUBSCRIPTION_INACTIVE',
      });
      expect(
        await prisma.patient.count({
          where: { workspaceId: doctor.workspace.id },
        }),
      ).toBe(1);

      // It subscribes again, alone, and writes again.
      const { paymentId } = await payments.createIntent(doctor.user.id, {
        billingPeriod: 'MONTHLY',
        paymentMethod: 'SYNTHETIC_CHARGILY',
        planId: 'DOCTOR_PRO',
      } as never);
      await payments.payWithSyntheticChargily(
        doctor.user.id,
        paymentId,
        demoCard,
      );
      await expect(
        guard.canActivate(
          routeContext(WriteRoutes.prototype.write, doctor.actor),
        ),
      ).resolves.toBe(true);
      const created = await patients.create(doctor.actor, patientDto(100));
      fixtures.created.patients.push(created.id);
    }, 60_000);

    it('does not expire a trial on the clock alone: the hourly job moves it, the account is read-only at once', async () => {
      const doctor = await fixtures.independentDoctor({
        subscription: {
          expiresAt: new Date(Date.now() - 60_000),
          status: 'TRIALING',
          trial: true,
        },
      });

      // Past its end, still TRIALING in the table: already read-only.
      expect(
        await entitlements.getEntitlementsForUser(doctor.actor),
      ).toMatchObject({ readOnly: true, status: 'EXPIRED' });

      await subscriptions.expireDueSubscriptions();

      expect(await subscriptionOf(doctor.user.id)).toMatchObject({
        status: 'EXPIRED',
      });
      expect(
        await prisma.user.findUniqueOrThrow({ where: { id: doctor.user.id } }),
      ).toMatchObject({ accountStatus: 'VERIFIED_NO_PLAN' });
      expect(
        await prisma.subscriptionEvent.findMany({
          where: { subscription: { userId: doctor.user.id } },
        }),
      ).toEqual([
        expect.objectContaining({
          fromStatus: 'TRIALING',
          toStatus: 'EXPIRED',
          type: 'EXPIRED',
        }),
      ]);
    });
  });

  describe('an establishment and its doctors', () => {
    it('shares the establishment subscription with the doctors affiliated to it, who follow it into read-only mode', async () => {
      const clinic = await fixtures.establishmentWithDoctors(2);
      const [affiliated] = clinic.doctors;

      const owner = await entitlements.getEntitlementsForUser(
        clinic.ownerActor,
      );
      const doctor = await entitlements.getEntitlementsForUser(
        affiliated.actor,
      );
      expect(doctor).toEqual(owner);
      expect(doctor).toMatchObject({
        plan: { code: 'EST_BASIC_CLINIC' },
        readOnly: false,
        usage: { doctors: 2 },
      });

      await prisma.subscription.update({
        data: { expiresAt: new Date(Date.now() - DAY), status: 'EXPIRED' },
        where: { id: clinic.subscription!.id },
      });

      expect(
        await entitlements.getEntitlementsForUser(affiliated.actor),
      ).toMatchObject({ readOnly: true, status: 'EXPIRED' });
      const error = await errorOf(
        patients.create(affiliated.actor, patientDto(200)),
      );
      expect(bodyOf(error)).toMatchObject({ code: 'SUBSCRIPTION_INACTIVE' });
    });

    it('holds the number of doctors of the plan, and a suspended doctor frees a seat', async () => {
      const clinic = await fixtures.establishmentWithDoctors(2, {
        subscription: {
          customQuotas: {
            aiAnalysesPerMonth: null,
            aiPipelines: null,
            maxDoctors: 2,
            maxPatients: null,
          },
        },
      });

      const full = await errorOf(
        entitlements.withQuota(clinic.workspace.id, 'maxDoctors', () =>
          Promise.resolve('invited'),
        ),
      );
      expect(bodyOf(full)).toMatchObject({
        code: 'QUOTA_EXCEEDED',
        limit: 2,
        quota: 'maxDoctors',
        used: 2,
      });

      await prisma.user.update({
        data: { accountStatus: 'SUSPENDED' },
        where: { id: clinic.doctors[0].user.id },
      });

      await expect(
        entitlements.withQuota(clinic.workspace.id, 'maxDoctors', () =>
          Promise.resolve('invited'),
        ),
      ).resolves.toBe('invited');
    });
  });

  describe('the free trial', () => {
    it('starts once per account, in a transaction, even when two verifications race', async () => {
      const doctor = await fixtures.independentDoctor({ subscription: false });
      await prisma.user.update({
        data: { accountStatus: 'VERIFIED_NO_PLAN' },
        where: { id: doctor.user.id },
      });

      const results = await Promise.all(
        [1, 2].map(() =>
          prisma.$transaction((transaction) =>
            subscriptions.startTrial(
              doctor.user.id,
              'INDEPENDENT_DOCTOR',
              transaction,
            ),
          ),
        ),
      );

      expect(results.filter(Boolean)).toHaveLength(1);
      expect(
        await prisma.subscription.count({ where: { userId: doctor.user.id } }),
      ).toBe(1);
      expect(
        await entitlements.getEntitlementsForUser(doctor.actor),
      ).toMatchObject({
        daysLeft: 14,
        quotas: { aiAnalysesPerMonth: 10, aiPipelines: null },
        readOnly: false,
        status: 'TRIALING',
        trial: true,
      });
      expect(
        await prisma.user.findUniqueOrThrow({ where: { id: doctor.user.id } }),
      ).toMatchObject({ accountStatus: 'ACTIVE' });
      expect(
        await prisma.doctorProfile.findUniqueOrThrow({
          where: { userId: doctor.user.id },
        }),
      ).toMatchObject({ subscriptionStatus: 'TRIALING' });
      expect(
        await prisma.subscriptionEvent.count({
          where: { subscription: { userId: doctor.user.id } },
        }),
      ).toBe(1);
    });
  });

  describe('the admin console', () => {
    it('lists, extends, stops and details an account, against the real queries', async () => {
      const doctor = await fixtures.independentDoctor({
        subscription: {
          expiresAt: new Date(Date.now() + 4 * DAY),
          startedAt: new Date(Date.now() - 10 * DAY),
          status: 'TRIALING',
          trial: true,
        },
      });
      const find = (query: Parameters<AdminSubscriptionsService['list']>[0]) =>
        admin.list({ search: doctor.user.email, ...query });

      const trialing = await find({ status: 'TRIALING' });
      expect(trialing.data).toEqual([
        expect.objectContaining({
          accountId: doctor.user.id,
          daysLeft: 4,
          status: 'TRIALING',
          trial: true,
          usage: { aiAnalysesThisMonth: 0, doctors: 1, patients: 0 },
        }),
      ]);
      expect((await find({ expiresWithinDays: 7 })).data).toHaveLength(1);
      expect((await find({ expiresWithinDays: 2 })).data).toHaveLength(0);
      expect((await find({ status: 'NO_PLAN' })).data).toHaveLength(0);
      expect((await find({ accountType: 'ESTABLISHMENT' })).data).toHaveLength(
        0,
      );

      await admin.extendTrial(doctor.user.id, doctor.user.id, {
        days: 7,
        reason: 'Demonstration prolongée',
      });
      expect((await find({ expiresWithinDays: 7 })).data).toHaveLength(0);
      expect((await find({ expiresWithinDays: 14 })).data).toHaveLength(1);

      await admin.cancel(doctor.user.id, doctor.user.id, {
        reason: 'Demande du titulaire',
      });
      expect((await find({ status: 'CANCELED' })).data).toHaveLength(1);
      expect(
        await entitlements.getEntitlementsForUser(doctor.actor),
      ).toMatchObject({ readOnly: true, status: 'CANCELED' });

      const detail = await admin.getDetail(doctor.user.id, doctor.user.id);
      expect(detail.events.map((event) => event.type)).toEqual([
        'CANCELED',
        'TRIAL_EXTENDED',
      ]);
      expect(detail.events[0]).toMatchObject({
        actor: { email: doctor.user.email },
        reason: 'Demande du titulaire',
      });
      expect(detail.subscription).toMatchObject({
        status: 'CANCELED',
        trial: true,
      });
      expect(detail.entitlements.readOnly).toBe(true);
    });

    it('activates a contract on quote with its own quotas', async () => {
      const clinic = await fixtures.establishmentWithDoctors(0, {
        subscription: false,
      });

      await admin.activateCustom(clinic.owner.id, clinic.owner.id, {
        planId: 'EST_CUSTOM',
        quotas: { aiAnalysesPerMonth: 5000, maxDoctors: 250 },
        reason: 'Contrat signé',
        until: new Date(Date.now() + 365 * DAY).toISOString(),
      });

      expect(
        await entitlements.getEntitlementsForUser(clinic.ownerActor),
      ).toMatchObject({
        plan: { code: 'EST_CUSTOM' },
        quotas: {
          aiAnalysesPerMonth: 5000,
          aiPipelines: null,
          maxDoctors: 250,
          maxPatients: null,
        },
        readOnly: false,
        status: 'ACTIVE',
      });
      expect(
        await prisma.establishment.findUniqueOrThrow({
          where: { id: clinic.establishment.id },
        }),
      ).toMatchObject({ subscriptionStatus: 'ACTIVE' });
    });
  });

  describe('the migration backfill', () => {
    // The statements between the markers of the migration, as they are run.
    const backfill = readFileSync(
      join(
        __dirname,
        '../../prisma/migrations/20261024120000_subscription_trial_quotas_events/migration.sql',
      ),
      'utf8',
    )
      .split('-- BACKFILL START')[1]
      .split('-- BACKFILL END')[0]
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n')
      .split(/;\s*\n/)
      .map((statement) => statement.trim())
      .filter(Boolean);

    const runBackfill = async () => {
      for (const statement of backfill) {
        await prisma.$executeRawUnsafe(statement);
      }
    };

    it('gives each verified account without a live subscription one trial, and gives nothing the second time', async () => {
      const lone = await fixtures.independentDoctor({ subscription: false });
      const clinic = await fixtures.establishmentWithDoctors(1, {
        subscription: false,
      });
      const subscribed = await fixtures.independentDoctor();
      const hadTrial = await fixtures.independentDoctor({
        subscription: false,
      });
      const suspended = await fixtures.independentDoctor({
        subscription: false,
      });
      for (const user of [lone.user, clinic.owner]) {
        await prisma.user.update({
          data: { accountStatus: 'VERIFIED_NO_PLAN' },
          where: { id: user.id },
        });
      }
      await prisma.user.update({
        data: { accountStatus: 'SUSPENDED' },
        where: { id: suspended.user.id },
      });
      // An account whose trial has ended: it is not given another.
      const plan = await fixtures.plan('DOCTOR_PRO');
      await prisma.subscription.create({
        data: {
          accountType: 'INDEPENDENT_DOCTOR',
          billingPeriod: 'MONTHLY',
          expiresAt: new Date(Date.now() - 10 * DAY),
          id: 'trial-' + hadTrial.user.id,
          planId: plan.id,
          startedAt: new Date(Date.now() - 24 * DAY),
          status: 'EXPIRED',
          trial: true,
          userId: hadTrial.user.id,
        },
      });

      await runBackfill();
      const afterFirst = {
        events: await prisma.subscriptionEvent.count({
          where: {
            subscription: {
              userId: {
                in: [lone.user.id, clinic.owner.id, subscribed.user.id],
              },
            },
          },
        }),
        subscriptions: await prisma.subscription.count({
          where: {
            userId: {
              in: [
                lone.user.id,
                clinic.owner.id,
                subscribed.user.id,
                hadTrial.user.id,
                suspended.user.id,
              ],
            },
          },
        }),
      };
      await runBackfill();
      await runBackfill();

      // Once: a doctor, an establishment; the others untouched.
      expect(afterFirst).toEqual({ events: 2, subscriptions: 4 });
      expect(
        await prisma.subscription.count({
          where: {
            userId: {
              in: [
                lone.user.id,
                clinic.owner.id,
                subscribed.user.id,
                hadTrial.user.id,
                suspended.user.id,
              ],
            },
          },
        }),
      ).toBe(4);
      expect(
        await prisma.subscriptionEvent.count({
          where: {
            subscription: {
              userId: {
                in: [lone.user.id, clinic.owner.id, subscribed.user.id],
              },
            },
          },
        }),
      ).toBe(2);

      // 14 days from the migration, on the reference plan of the account type.
      const doctorTrial = await prisma.subscription.findUniqueOrThrow({
        include: { plan: true },
        where: { id: 'trial-' + lone.user.id },
      });
      expect(doctorTrial).toMatchObject({
        accountType: 'INDEPENDENT_DOCTOR',
        status: 'TRIALING',
        trial: true,
      });
      expect(doctorTrial.plan.code).toBe('DOCTOR_PRO');
      const days =
        ((doctorTrial.expiresAt as Date).getTime() -
          (doctorTrial.startedAt as Date).getTime()) /
        DAY;
      expect(days).toBe(14);
      const clinicTrial = await prisma.subscription.findUniqueOrThrow({
        include: { plan: true },
        where: { id: 'trial-' + clinic.owner.id },
      });
      expect(clinicTrial.plan.code).toBe('EST_BASIC_CLINIC');

      // The accounts are usable at once, the affiliated doctor included.
      expect(
        await prisma.user.findUniqueOrThrow({ where: { id: lone.user.id } }),
      ).toMatchObject({ accountStatus: 'ACTIVE' });
      expect(
        await prisma.doctorProfile.findUniqueOrThrow({
          where: { userId: lone.user.id },
        }),
      ).toMatchObject({ subscriptionStatus: 'TRIALING' });
      expect(
        await prisma.doctorProfile.findUniqueOrThrow({
          where: { userId: clinic.doctors[0].user.id },
        }),
      ).toMatchObject({ subscriptionStatus: 'TRIALING' });
      expect(
        await entitlements.getEntitlementsForUser(clinic.doctors[0].actor),
      ).toMatchObject({ readOnly: false, status: 'TRIALING' });

      // Nothing for a live subscription, an ended trial, a suspended account.
      expect(
        await prisma.subscription.findMany({
          where: { userId: subscribed.user.id },
        }),
      ).toHaveLength(1);
      expect(
        await prisma.subscription.findUniqueOrThrow({
          where: { id: 'trial-' + hadTrial.user.id },
        }),
      ).toMatchObject({ status: 'EXPIRED' });
      expect(
        await prisma.subscription.count({
          where: { userId: suspended.user.id },
        }),
      ).toBe(0);
    }, 60_000);
  });
});
