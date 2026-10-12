import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';

import { type AuthenticatedUserPayload } from '../auth/types/authenticated-request.type';
import { PrismaService } from '../prisma/prisma.service';
import { type DashboardOverview } from './dashboard-overview.dto';
import { DashboardModule } from './dashboard.module';
import { DashboardService } from './dashboard.service';

// Runs the real queries (Prisma and the per-day SQL) against a migrated test
// database: TEST_DATABASE_URL, whose name must end in "_test". Skipped
// without it. Each run creates its own workspaces, then removes them.
const testDatabaseUrl = process.env.TEST_DATABASE_URL ?? '';
const databaseName = testDatabaseUrl
  ? new URL(testDatabaseUrl).pathname.slice(1)
  : '';
const describeWithDatabase = testDatabaseUrl ? describe : describe.skip;

// 10:00 in Algiers, Sunday 11 October 2026.
const NOW = new Date('2026-10-11T09:00:00.000Z');
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const ago = (ms: number) => new Date(NOW.getTime() - ms);

const predictions = (top: number) => [
  { label: 'meningioma', probability: top },
  { label: 'glioma', probability: (1 - top) / 3 },
  { label: 'notumor', probability: (1 - top) / 3 },
  { label: 'pituitary', probability: (1 - top) / 3 },
];

describeWithDatabase('GET /dashboard/overview against a database', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let service: DashboardService;
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const created = {
    patients: [] as string[],
    users: [] as string[],
    workspaces: [] as string[],
  };
  const actors = {} as Record<
    'adminA' | 'affiliatedA' | 'adminB' | 'doctorC' | 'doctorD',
    AuthenticatedUserPayload
  >;
  let patientA1 = '';

  let counter = 0;
  async function user(role: string, accountStatus = 'ACTIVE') {
    counter += 1;
    const row = await prisma.user.create({
      data: {
        accountStatus: accountStatus as never,
        email: `dash-${suffix}-${counter}@healix.test`,
        fullName: `Dashboard ${counter}`,
        passwordHash: 'not-a-real-hash',
        phone: `dash-${suffix}-${counter}`,
        role: role as never,
      },
    });
    created.users.push(row.id);
    return row;
  }

  async function doctorProfile(userId: string, establishmentId: string | null) {
    return prisma.doctorProfile.create({
      data: {
        establishmentId,
        isIndependent: establishmentId === null,
        professionalAddress: 'Alger',
        speciality: 'Neurologie',
        subscriptionStatus: 'NO_PLAN',
        userId,
        verificationStatus: 'VERIFIED',
        wilaya: 'Alger',
      },
    });
  }

  async function establishmentWorkspace(ownerId: string) {
    const establishment = await prisma.establishment.create({
      data: {
        address: 'Alger',
        managerFullName: 'Direction',
        name: `Clinique ${suffix}`,
        ownerId,
        phone: '0550000000',
        professionalEmail: `clinic-${suffix}-${ownerId}@healix.test`,
        subscriptionStatus: 'NO_PLAN',
        type: 'CLINIC',
        verificationStatus: 'VERIFIED',
        wilaya: 'Alger',
      },
    });
    const workspace = await prisma.workspace.create({
      data: {
        establishmentId: establishment.id,
        name: establishment.name,
        type: 'ESTABLISHMENT',
      },
    });
    created.workspaces.push(workspace.id);
    await prisma.workspaceMembership.create({
      data: { role: 'OWNER', userId: ownerId, workspaceId: workspace.id },
    });
    return { establishment, workspace };
  }

  async function patient(
    workspaceId: string,
    owner: { establishmentId?: string; doctorProfileId?: string },
    createdAt: Date,
  ) {
    counter += 1;
    const row = await prisma.patient.create({
      data: {
        address: 'Alger',
        birthDate: new Date('1980-01-01T00:00:00Z'),
        commune: 'Alger',
        createdAt,
        doctorProfileId: owner.doctorProfileId ?? null,
        emergencyContactName: 'Contact',
        emergencyContactPhone: '0550000000',
        establishmentId: owner.establishmentId ?? null,
        firstName: `Prénom${counter}`,
        firstNameAr: `اسم${counter}`,
        gender: 'FEMALE',
        insurance: 'CNAS',
        lastName: `Nom${counter}`,
        lastNameAr: `لقب${counter}`,
        nationalId: `NID-${suffix}-${counter}`,
        phone: '0550000000',
        sector: 'PUBLIC',
        wilaya: 'Alger',
        workspaceId,
      },
    });
    created.patients.push(row.id);
    return row;
  }

  async function run(
    patientId: string,
    requestedById: string,
    createdAt: Date,
    extra: {
      status?: string;
      decision?: string | null;
      top?: number | null;
      pipeline?: string;
      modelDecision?: string;
      predictions?: { label: string; probability: number }[];
    },
  ) {
    const document = await prisma.patientDocument.create({
      data: {
        documentType: 'MEDICAL_IMAGE',
        localPath: 'x',
        mimeType: 'image/png',
        originalName: 'irm.png',
        patientId,
        size: 1,
        storedName: 'irm.png',
        uploadedById: requestedById,
      },
    });
    return prisma.aiAnalysisRun.create({
      data: {
        createdAt,
        decisionStatus: (extra.decision ?? null) as never,
        modelDecision: extra.modelDecision,
        patientId,
        pipeline: extra.pipeline ?? 'brain',
        predictions:
          extra.predictions ??
          (extra.top === null || extra.top === undefined
            ? undefined
            : predictions(extra.top)),
        requestedById,
        sourceDocumentId: document.id,
        status: (extra.status ?? 'SUCCEEDED') as never,
      },
    });
  }

  async function appointment(
    patientId: string,
    doctorProfileId: string,
    createdById: string,
    scheduledAt: Date,
    status: string,
  ) {
    return prisma.appointment.create({
      data: {
        createdById,
        doctorProfileId,
        patientId,
        reason: 'Suivi',
        scheduledAt,
        status: status as never,
      },
    });
  }

  async function consultation(patientId: string, date: Date) {
    return prisma.patientConsultation.create({
      data: { date, diagnosis: '-', patientId, reason: '-', treatment: '-' },
    });
  }

  beforeAll(async () => {
    if (!databaseName.endsWith('_test')) {
      throw new Error(
        `TEST_DATABASE_URL must name a database ending in "_test", not "${databaseName}".`,
      );
    }
    process.env.DATABASE_URL = testDatabaseUrl;
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ ignoreEnvFile: true, isGlobal: true }),
        DashboardModule,
      ],
    }).compile();
    await moduleRef.init();
    prisma = moduleRef.get(PrismaService);
    service = moduleRef.get(DashboardService);

    // Workspace A: an establishment, one active and one suspended affiliated doctor.
    const adminA = await user('ESTABLISHMENT_ADMIN');
    const { establishment: establishmentA, workspace: workspaceA } =
      await establishmentWorkspace(adminA.id);
    const affiliatedA = await user('AFFILIATED_DOCTOR');
    const doctorA = await doctorProfile(affiliatedA.id, establishmentA.id);
    await prisma.workspaceMembership.create({
      data: {
        role: 'DOCTOR',
        userId: affiliatedA.id,
        workspaceId: workspaceA.id,
      },
    });
    const suspendedA = await user('AFFILIATED_DOCTOR', 'SUSPENDED');
    await doctorProfile(suspendedA.id, establishmentA.id);

    const pA1 = await patient(
      workspaceA.id,
      { establishmentId: establishmentA.id },
      ago(2 * DAY),
    );
    patientA1 = pA1.id;
    const pA2 = await patient(
      workspaceA.id,
      { establishmentId: establishmentA.id },
      ago(40 * DAY),
    );
    await prisma.patientConsent.create({
      data: {
        patientId: pA1.id,
        recordedAt: ago(10 * DAY),
        recordedById: adminA.id,
        status: 'SIGNED',
        type: 'DIAGNOSTIC_AI',
      },
    });

    // Runs of A: pending (2 h, 30 h), validated, corrected, failed, rejected
    // at 00:30 local today, and one out of the period.
    await run(pA1.id, adminA.id, ago(2 * HOUR), { top: 0.95 });
    await run(pA1.id, adminA.id, ago(30 * HOUR), { top: 0.8 });
    await run(pA1.id, adminA.id, ago(3 * DAY), {
      decision: 'VALIDATED',
      top: 0.97,
    });
    await run(pA1.id, adminA.id, ago(5 * DAY), {
      decision: 'CORRECTED',
      top: 0.7,
    });
    await run(pA1.id, adminA.id, ago(1 * DAY), { status: 'FAILED', top: null });
    await run(pA2.id, adminA.id, new Date('2026-10-10T23:30:00Z'), {
      decision: 'REJECTED',
      top: 0.92,
    });
    await run(pA1.id, adminA.id, ago(45 * DAY), {
      decision: 'VALIDATED',
      top: 0.5,
    });

    // Today in Algiers: 2026-10-10T23:00Z to 2026-10-11T23:00Z.
    await appointment(
      pA1.id,
      doctorA.id,
      adminA.id,
      new Date('2026-10-11T13:00:00Z'),
      'SCHEDULED',
    );
    await appointment(
      pA1.id,
      doctorA.id,
      adminA.id,
      new Date('2026-10-11T08:00:00Z'),
      'CONFIRMED',
    );
    await appointment(
      pA2.id,
      doctorA.id,
      adminA.id,
      new Date('2026-10-10T23:15:00Z'),
      'COMPLETED',
    );
    await appointment(
      pA2.id,
      doctorA.id,
      adminA.id,
      new Date('2026-10-11T15:00:00Z'),
      'CANCELED',
    );
    // 23:30 local on the 10th: yesterday.
    await appointment(
      pA1.id,
      doctorA.id,
      adminA.id,
      new Date('2026-10-10T22:30:00Z'),
      'COMPLETED',
    );

    await consultation(pA1.id, new Date('2026-10-10T23:30:00Z'));
    await consultation(pA1.id, new Date('2026-10-09T10:00:00Z'));
    await consultation(pA2.id, ago(50 * DAY));

    // Workspace B: another establishment, plenty of activity, none of it A's.
    const adminB = await user('ESTABLISHMENT_ADMIN');
    const { establishment: establishmentB, workspace: workspaceB } =
      await establishmentWorkspace(adminB.id);
    const doctorBUser = await user('AFFILIATED_DOCTOR');
    const doctorB = await doctorProfile(doctorBUser.id, establishmentB.id);
    const pB1 = await patient(
      workspaceB.id,
      { establishmentId: establishmentB.id },
      ago(1 * DAY),
    );
    await run(pB1.id, adminB.id, ago(40 * HOUR), { top: 0.6 });
    await run(pB1.id, adminB.id, ago(1 * HOUR), {
      decision: 'VALIDATED',
      top: 0.99,
    });
    await appointment(
      pB1.id,
      doctorB.id,
      adminB.id,
      new Date('2026-10-11T12:00:00Z'),
      'SCHEDULED',
    );
    await appointment(
      pB1.id,
      doctorB.id,
      adminB.id,
      new Date('2026-10-11T07:00:00Z'),
      'COMPLETED',
    );
    await consultation(pB1.id, ago(1 * HOUR));

    // Workspace C: an independent doctor.
    const doctorCUser = await user('INDEPENDENT_DOCTOR');
    const doctorC = await doctorProfile(doctorCUser.id, null);
    const workspaceC = await prisma.workspace.create({
      data: {
        name: 'Cabinet',
        ownerDoctorProfileId: doctorC.id,
        type: 'PRIVATE_PRACTICE',
      },
    });
    created.workspaces.push(workspaceC.id);
    await prisma.workspaceMembership.create({
      data: {
        role: 'OWNER',
        userId: doctorCUser.id,
        workspaceId: workspaceC.id,
      },
    });
    const pC1 = await patient(
      workspaceC.id,
      { doctorProfileId: doctorC.id },
      ago(3 * DAY),
    );
    await run(pC1.id, doctorCUser.id, ago(3 * HOUR), { top: 0.91 });
    await appointment(
      pC1.id,
      doctorC.id,
      doctorCUser.id,
      new Date('2026-10-11T14:00:00Z'),
      'CONFIRMED',
    );

    // Workspace D: an independent doctor, the three chains. Only the brain
    // run counts in the uncertain share.
    const doctorDUser = await user('INDEPENDENT_DOCTOR');
    const doctorD = await doctorProfile(doctorDUser.id, null);
    const workspaceD = await prisma.workspace.create({
      data: {
        name: 'Cabinet D',
        ownerDoctorProfileId: doctorD.id,
        type: 'PRIVATE_PRACTICE',
      },
    });
    created.workspaces.push(workspaceD.id);
    await prisma.workspaceMembership.create({
      data: {
        role: 'OWNER',
        userId: doctorDUser.id,
        workspaceId: workspaceD.id,
      },
    });
    const pD1 = await patient(
      workspaceD.id,
      { doctorProfileId: doctorD.id },
      ago(3 * DAY),
    );
    await run(pD1.id, doctorDUser.id, ago(3 * HOUR), { top: 0.8 });
    // Never written so by the service (a BreakHis score is no probability):
    // these predictions would count as uncertain if the chain were not read.
    await run(pD1.id, doctorDUser.id, ago(2 * HOUR), {
      modelDecision: 'benign',
      pipeline: 'pathology-breast',
      predictions: [{ label: 'benign', probability: 0.5 }],
    });
    await run(pD1.id, doctorDUser.id, ago(1 * HOUR), {
      decision: 'VALIDATED',
      pipeline: 'pathology-nuclei',
    });

    const actor = (row: {
      id: string;
      email: string;
      role: string;
    }): AuthenticatedUserPayload => ({
      email: row.email,
      role: row.role as AuthenticatedUserPayload['role'],
      sub: row.id,
      tokenType: 'access',
    });
    actors.adminA = actor(adminA);
    actors.affiliatedA = actor(affiliatedA);
    actors.adminB = actor(adminB);
    actors.doctorC = actor(doctorCUser);
    actors.doctorD = actor(doctorDUser);
  }, 60_000);

  afterAll(async () => {
    if (prisma) {
      // Patients first: their runs, documents, appointments, consents and
      // consultations go with them.
      await prisma.patient.deleteMany({
        where: { id: { in: created.patients } },
      });
      await prisma.workspace.deleteMany({
        where: { id: { in: created.workspaces } },
      });
      await prisma.user.deleteMany({ where: { id: { in: created.users } } });
    }
    await moduleRef?.close();
  });

  let overviewA: DashboardOverview;

  beforeAll(async () => {
    overviewA = await service.getOverview(actors.adminA, 30, NOW);
  });

  it('counts the patients of the workspace only', () => {
    expect(overviewA.patients).toEqual({ newInPeriod: 1, total: 2 });
  });

  it("splits today's appointments by status, on the Algiers calendar day", () => {
    expect(overviewA.appointmentsToday.byStatus).toEqual({
      CANCELED: 1,
      COMPLETED: 1,
      CONFIRMED: 1,
      NO_SHOW: 0,
      SCHEDULED: 1,
    });
    expect(overviewA.appointmentsToday.total).toBe(4);
    // 08:00 UTC is already past at 09:00 UTC: next is 13:00 UTC.
    expect(overviewA.appointmentsToday.next?.scheduledAt).toBe(
      '2026-10-11T13:00:00.000Z',
    );
    expect(
      Object.keys(overviewA.appointmentsToday.next?.patient ?? {}).sort(),
    ).toEqual(['firstName', 'firstNameAr', 'lastName', 'lastNameAr']);
  });

  it('summarizes the AI analyses of the period', () => {
    const ai = overviewA.aiAnalyses;
    expect(ai.total).toBe(6);
    expect(ai.pending.count).toBe(2);
    expect(ai.pending.oldestAgeHours).toBe(30);
    expect([ai.validated, ai.corrected, ai.rejected]).toEqual([1, 1, 1]);
    // Top probability 0.80 and 0.70 out of the five succeeded runs.
    expect(ai.uncertain).toEqual({ count: 2, threshold: 0.9, total: 5 });
    expect(ai.recent).toHaveLength(5);
    expect(ai.recent[0]).toMatchObject({
      decision: null,
      modelLabel: 'meningioma',
      status: 'SUCCEEDED',
    });
    expect(ai.recent[0].patient.id).toBe(patientA1);
    expect(ai.recent.map((run) => run.createdAt)).toEqual(
      [...ai.recent.map((run) => run.createdAt)].sort().reverse(),
    );
  });

  it('fills every day of the period, empty days included, on local days', () => {
    expect(overviewA.activity).toHaveLength(30);
    expect(overviewA.activity[0].date).toBe('2026-09-12');
    expect(overviewA.activity[29]).toEqual({
      aiAnalyses: 2,
      completedAppointments: 1,
      consultations: 1,
      date: '2026-10-11',
    });
    expect(overviewA.activity[28]).toEqual({
      aiAnalyses: 2,
      completedAppointments: 1,
      consultations: 0,
      date: '2026-10-10',
    });
    expect(overviewA.activity[27]).toMatchObject({
      consultations: 1,
      date: '2026-10-09',
    });
    expect(
      overviewA.activity.filter(
        (day) =>
          day.aiAnalyses + day.consultations + day.completedAppointments === 0,
      ).length,
    ).toBeGreaterThan(20);
  });

  it('agrees between the SQL per-day sums and the Prisma counts', () => {
    const sum = (key: 'aiAnalyses' | 'completedAppointments') =>
      overviewA.activity.reduce((total, day) => total + day[key], 0);
    expect(sum('aiAnalyses')).toBe(overviewA.aiAnalyses.total);
    expect(sum('completedAppointments')).toBe(2);
  });

  it('lists what needs attention, with nothing from another workspace', () => {
    expect(overviewA.attention).toEqual([
      { count: 1, kind: 'AI_PENDING_OVER_24H' },
      { count: 1, kind: 'APPOINTMENTS_UNCONFIRMED_TODAY' },
      { count: 1, kind: 'AI_CONSENT_MISSING' },
    ]);
  });

  it('counts the active affiliated doctors for the establishment only', async () => {
    expect(overviewA.affiliatedDoctors).toEqual({ active: 1 });

    // Same workspace seen by its affiliated doctor: same figures, no doctor count.
    const asDoctor = await service.getOverview(actors.affiliatedA, 30, NOW);
    expect(asDoctor.affiliatedDoctors).toBeNull();
    expect(asDoctor.patients).toEqual(overviewA.patients);
    expect(asDoctor.aiAnalyses.total).toBe(overviewA.aiAnalyses.total);
  });

  it('never shows anything of another workspace', async () => {
    const overviewB = await service.getOverview(actors.adminB, 30, NOW);
    expect(overviewB.patients.total).toBe(1);
    expect(overviewB.aiAnalyses.total).toBe(2);
    expect(overviewB.appointmentsToday.total).toBe(2);
    expect(overviewB.affiliatedDoctors).toEqual({ active: 1 });
    expect(
      overviewB.aiAnalyses.recent.map((run) => run.patient.id),
    ).not.toContain(patientA1);

    const overviewC = await service.getOverview(actors.doctorC, 30, NOW);
    expect(overviewC.patients).toEqual({ newInPeriod: 1, total: 1 });
    expect(overviewC.appointmentsToday).toMatchObject({ total: 1 });
    expect(overviewC.aiAnalyses).toMatchObject({
      total: 1,
      uncertain: { count: 0, total: 1 },
    });
    expect(overviewC.affiliatedDoctors).toBeNull();
    expect(
      overviewC.activity.reduce((total, day) => total + day.consultations, 0),
    ).toBe(0);
  });

  it('counts the uncertain share on brain runs only, and names each chain', async () => {
    const overviewD = await service.getOverview(actors.doctorD, 30, NOW);
    expect(overviewD.aiAnalyses).toMatchObject({
      total: 3,
      uncertain: { count: 1, threshold: 0.9, total: 1 },
      validated: 1,
    });
    expect(
      overviewD.aiAnalyses.recent.map((run) => [run.pipeline, run.modelLabel]),
    ).toEqual([
      ['pathology-nuclei', null],
      ['pathology-breast', 'benign'],
      ['brain', 'meningioma'],
    ]);
  });

  it('follows the requested period length', async () => {
    const week = await service.getOverview(actors.adminA, 7, NOW);
    expect(week.activity).toHaveLength(7);
    expect(week.period).toEqual({
      days: 7,
      from: '2026-10-05',
      to: '2026-10-11',
    });
    // The corrected run (5 days ago) is in; nothing older.
    expect(week.aiAnalyses.total).toBe(6);
    const twoDays = await service.getOverview(actors.adminA, 2, NOW);
    expect(twoDays.aiAnalyses.total).toBe(4);
  });
});
