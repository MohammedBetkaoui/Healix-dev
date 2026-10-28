import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';

import { AiReportRenderer } from '../ai-analysis-runs/report/ai-report-renderer';
import { type AuthenticatedUserPayload } from '../auth/types/authenticated-request.type';
import {
  assertTestDatabaseName,
  FakePdfRenderer,
  IntegrationFixtures,
  readTestDatabase,
} from '../common/testing/integration-fixtures';
import { nextSequenceValue } from '../common/utils/clinical-document-number';
import { PrescriptionsModule } from '../prescriptions/prescriptions.module';
import { PrescriptionsService } from '../prescriptions/prescriptions.service';
import { PrismaService } from '../prisma/prisma.service';
import { type CreatePrescriptionDto } from '../prescriptions/dto/create-prescription.dto';
import { ReportsModule } from './reports.module';
import { ReportsService } from './reports.service';

// The numbers of the prescriptions (ORD-<year>-NNNNNN) and of the reports
// (CR-<year>-NNNNNN) come from one row per (type, year) that every
// finalization increments. Ten at once, in a year that has no row yet, must
// get ten distinct, consecutive numbers: the first of the year is the one
// where two inserts of the same row can meet. Runs on TEST_DATABASE_URL
// (a database whose name ends in "_test"); skipped without it.
const database = readTestDatabase();
const describeWithDatabase = database ? describe : describe.skip;

// A year that no other test (nor the clock of a real run) uses.
const YEAR = 2099;
const PARALLEL = 10;

describeWithDatabase(
  'numbering of the clinical documents against a database',
  () => {
    let moduleRef: TestingModule;
    let prisma: PrismaService;
    let reports: ReportsService;
    let prescriptions: PrescriptionsService;
    let fixtures: IntegrationFixtures;
    let actor: AuthenticatedUserPayload;
    let patientId = '';
    const uploadRoot = mkdtempSync(join(tmpdir(), 'healix-numbering-'));

    const resetYear = () =>
      prisma.clinicalDocumentSequence.deleteMany({
        where: { year: { in: [YEAR, YEAR + 1] } },
      });
    const sequenceOf = (type: string) =>
      prisma.clinicalDocumentSequence.findUnique({
        where: { type_year: { type, year: YEAR } },
      });

    // Only Date is simulated: the driver, Prisma and Nest keep their timers.
    const atYear2099 = () =>
      jest.useFakeTimers({
        doNotFake: [
          'hrtime',
          'nextTick',
          'performance',
          'queueMicrotask',
          'requestAnimationFrame',
          'cancelAnimationFrame',
          'requestIdleCallback',
          'cancelIdleCallback',
          'setImmediate',
          'clearImmediate',
          'setInterval',
          'clearInterval',
          'setTimeout',
          'clearTimeout',
        ],
        now: new Date(`${YEAR}-06-15T09:00:00.000Z`),
      });

    const draftReport = async (n: number) =>
      (
        await reports.create(actor, {
          patientId,
          sections: [{ body: `Examen ${n}`, id: 'findings' }],
          title: `Note ${n}`,
        })
      ).id;

    const draftPrescription = async (n: number) =>
      (
        await prescriptions.create(actor, {
          items: [
            {
              dci: `Paracétamol ${n}`,
              dosePerIntake: '1 comprimé',
              durationDays: 3,
              frequency: '3 fois par jour',
              pharmaceuticalForm: 'TABLET',
              quantity: '9 comprimés',
              regulatoryCategory: 'STANDARD',
              route: 'ORAL',
              strength: '500 mg',
            },
          ],
          patientId,
        } as unknown as CreatePrescriptionDto)
      ).id;

    // allSettled: a failure says which one, instead of hiding the others.
    const failures = (results: PromiseSettledResult<unknown>[]) =>
      results
        .filter(
          (result): result is PromiseRejectedResult =>
            result.status === 'rejected',
        )
        .map((result) => {
          const reason = result.reason as { code?: string; message?: string };
          // The last line of a Prisma message is the one that says what failed.
          const line = (reason.message ?? 'unknown error')
            .trim()
            .split('\n')
            .pop();
          return `${reason.code ?? 'error'}: ${line}`;
        });

    beforeAll(async () => {
      assertTestDatabaseName(database!);
      process.env.DATABASE_URL = database!.url;
      process.env.UPLOAD_ROOT = uploadRoot;
      moduleRef = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({ ignoreEnvFile: true, isGlobal: true }),
          ReportsModule,
          PrescriptionsModule,
        ],
      })
        .overrideProvider(AiReportRenderer)
        .useValue(new FakePdfRenderer())
        .compile();
      await moduleRef.init();
      prisma = moduleRef.get(PrismaService);
      reports = moduleRef.get(ReportsService);
      prescriptions = moduleRef.get(PrescriptionsService);
      fixtures = new IntegrationFixtures(prisma, 'num');

      // Subscribed past 2099: the spec sets the clock there to start a new
      // numbering year, and a subscription that has ended refuses to sign.
      const doctor = await fixtures.independentDoctor({
        subscription: { expiresAt: new Date('2100-12-31T00:00:00.000Z') },
      });
      actor = doctor.actor;
      patientId = (
        await fixtures.patient(doctor.workspace.id, doctor.profile.id)
      ).id;
      await resetYear();
    }, 60_000);

    afterAll(async () => {
      jest.useRealTimers();
      if (prisma) {
        await fixtures?.cleanup();
        await resetYear();
      }
      await moduleRef?.close();
      rmSync(uploadRoot, { force: true, recursive: true });
    }, 60_000);

    afterEach(() => {
      jest.useRealTimers();
    });

    it('gives ten parallel finalizations of a year without a sequence ten distinct consecutive report numbers', async () => {
      expect(await sequenceOf('CLINICAL_REPORT')).toBeNull();
      const ids = await Promise.all(
        Array.from({ length: PARALLEL }, (_, index) => draftReport(index + 1)),
      );

      atYear2099();
      const results = await Promise.allSettled(
        ids.map((id) => reports.finalize(actor, id)),
      );
      jest.useRealTimers();

      expect(failures(results)).toEqual([]);
      const numbers = results.map(
        (result) =>
          (result as PromiseFulfilledResult<{ number: string }>).value.number,
      );
      expect(new Set(numbers).size).toBe(PARALLEL);
      expect([...numbers].sort()).toEqual(
        Array.from(
          { length: PARALLEL },
          (_, index) => `CR-${YEAR}-${String(index + 1).padStart(6, '0')}`,
        ),
      );
      expect((await sequenceOf('CLINICAL_REPORT'))?.lastValue).toBe(PARALLEL);

      // What the database holds is what the answers said.
      const stored = await prisma.clinicalReport.findMany({
        select: { number: true, status: true },
        where: { id: { in: ids } },
      });
      expect(stored.map((row) => row.number).sort()).toEqual(
        [...numbers].sort(),
      );
      expect(new Set(stored.map((row) => row.status))).toEqual(
        new Set(['FINAL']),
      );
    }, 120_000);

    it('gives ten parallel validations of a year without a sequence ten distinct consecutive prescription numbers', async () => {
      expect(await sequenceOf('PRESCRIPTION')).toBeNull();
      const ids = await Promise.all(
        Array.from({ length: PARALLEL }, (_, index) =>
          draftPrescription(index + 1),
        ),
      );

      atYear2099();
      const results = await Promise.allSettled(
        ids.map((id) => prescriptions.validate(actor, id)),
      );
      jest.useRealTimers();

      expect(failures(results)).toEqual([]);
      const numbers = results.map(
        (result) =>
          (result as PromiseFulfilledResult<{ number: string }>).value.number,
      );
      expect(new Set(numbers).size).toBe(PARALLEL);
      expect([...numbers].sort()).toEqual(
        Array.from(
          { length: PARALLEL },
          (_, index) => `ORD-${YEAR}-${String(index + 1).padStart(6, '0')}`,
        ),
      );
      expect((await sequenceOf('PRESCRIPTION'))?.lastValue).toBe(PARALLEL);
    }, 120_000);

    it('goes on after them, one number at a time, in the same year', async () => {
      const id = await draftReport(PARALLEL + 1);

      atYear2099();
      const finalized = await reports.finalize(actor, id);
      jest.useRealTimers();

      expect(finalized.number).toBe(
        `CR-${YEAR}-${String(PARALLEL + 1).padStart(6, '0')}`,
      );
      expect((await sequenceOf('CLINICAL_REPORT'))?.lastValue).toBe(
        PARALLEL + 1,
      );
      // The two types count apart.
      expect((await sequenceOf('PRESCRIPTION'))?.lastValue).toBe(PARALLEL);
    }, 60_000);

    it('counts the same type apart from one year to the next', async () => {
      const otherYear = YEAR + 1;
      const sequenceOfOtherYear = () =>
        prisma.clinicalDocumentSequence.findUnique({
          where: { type_year: { type: 'CLINICAL_REPORT', year: otherYear } },
        });
      expect(await sequenceOfOtherYear()).toBeNull();
      const before = (await sequenceOf('CLINICAL_REPORT'))!.lastValue;

      const first = await prisma.$transaction((tx) =>
        nextSequenceValue(tx, 'CLINICAL_REPORT', otherYear),
      );
      const second = await prisma.$transaction((tx) =>
        nextSequenceValue(tx, 'CLINICAL_REPORT', otherYear),
      );
      expect([first, second]).toEqual([1, 2]);

      // The counter of the first year is not touched by the other one.
      expect((await sequenceOf('CLINICAL_REPORT'))!.lastValue).toBe(before);
    }, 60_000);

    it('gives its number back to the year when a transaction is rolled back', async () => {
      const before = (await sequenceOf('CLINICAL_REPORT'))!.lastValue;

      await expect(
        prisma.$transaction(async (tx) => {
          await nextSequenceValue(tx, 'CLINICAL_REPORT', YEAR);
          throw new Error('the caller aborts');
        }),
      ).rejects.toThrow('the caller aborts');

      expect((await sequenceOf('CLINICAL_REPORT'))!.lastValue).toBe(before);
    }, 60_000);
  },
);
