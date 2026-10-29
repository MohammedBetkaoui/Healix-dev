import { hash } from 'bcrypt';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { type AuthenticatedUserPayload } from '../../auth/types/authenticated-request.type';
import { type PrismaService } from '../../prisma/prisma.service';
import { SUBSCRIPTION_PLAN_CATALOG } from '../../subscriptions/plans/plan-catalog';
import { type PlanQuotas } from '../../subscriptions/plans/plan-quotas';

// What the integration specs share: the test database they run on, and the
// rows they need (user, workspace, doctor, patient, appointment), created
// with a suffix of their own and removed by cleanup(). Specs only.

export type TestDatabase = { name: string; url: string };

// The cleanup of the storage environment, while it is up (one per process).
let storageCleanup: (() => void) | null = null;

// TEST_DATABASE_URL, null when it is not set (the spec is then skipped).
// With a database comes the environment of the encrypted storage (a master
// key of the process, a private folder): the specs that store documents
// through the StorageService get it for free.
export function readTestDatabase(
  env: Record<string, string | undefined> = process.env,
): TestDatabase | null {
  const url = env.TEST_DATABASE_URL ?? '';
  if (!url) return null;
  applyStorageTestEnv(env);
  return { name: new URL(url).pathname.slice(1), url };
}

// A spec writes and deletes rows: only a database made for it.
export function assertTestDatabaseName(database: TestDatabase): void {
  if (!database.name.endsWith('_test')) {
    throw new Error(
      `TEST_DATABASE_URL must name a database ending in "_test", not "${database.name}".`,
    );
  }
}

// The environment the specs of the encrypted storage run with: a master key
// of their own (random, per process — the environment would provide it), and
// a private folder under the temporary directory, so that a spec never reads
// the files of another. The returned function removes the folder (afterAll);
// the process exit takes it away as well, for the specs that never call it.
export function applyStorageTestEnv(
  env: Record<string, string | undefined> = process.env,
): () => void {
  if (storageCleanup !== null) return storageCleanup;

  const localRoot = mkdtempSync(join(tmpdir(), 'healix-storage-'));

  env.STORAGE_MASTER_KEY ??= randomBytes(32).toString('base64');
  env.STORAGE_LOCAL_ROOT = localRoot;

  storageCleanup = () => {
    rmSync(localRoot, { force: true, recursive: true });
    storageCleanup = null;
  };
  process.on('exit', () => storageCleanup?.());

  return storageCleanup;
}

// A PDF that is not rendered by Chromium: enough for the checksums, the
// files and the rows that go with a document.
export class FakePdfRenderer {
  rendered = 0;

  render(): Promise<Buffer> {
    this.rendered += 1;
    return Promise.resolve(
      Buffer.from(`%PDF-1.4\n% integration test ${this.rendered}\n%%EOF\n`),
    );
  }

  onModuleDestroy(): Promise<void> {
    return Promise.resolve();
  }
}

export const TEST_PASSWORD = 'Integration-mdp-2026!';

// The subscription a fixture account holds: live (ACTIVE for a year) unless
// told otherwise.
export type FixtureSubscription = {
  customQuotas?: PlanQuotas;
  expiresAt?: Date;
  plan?: string;
  startedAt?: Date;
  status?: string;
  trial?: boolean;
};

type Role =
  | 'ADMIN_VERIFICATION'
  | 'AFFILIATED_DOCTOR'
  | 'ESTABLISHMENT_ADMIN'
  | 'INDEPENDENT_DOCTOR'
  | 'SUPER_ADMIN';

export class IntegrationFixtures {
  // Unique to this run: two runs on the same database never meet.
  readonly suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  readonly created = {
    patients: [] as string[],
    users: [] as string[],
    workspaces: [] as string[],
  };
  private counter = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly label: string,
  ) {}

  next(): number {
    this.counter += 1;
    return this.counter;
  }

  actor(row: {
    email: string;
    id: string;
    role: string;
  }): AuthenticatedUserPayload {
    return {
      email: row.email,
      role: row.role as AuthenticatedUserPayload['role'],
      sub: row.id,
      tokenType: 'access',
    };
  }

  // With a password, a real bcrypt hash: the account can sign in.
  async user(role: Role, options: { password?: string; status?: string } = {}) {
    const n = this.next();
    const row = await this.prisma.user.create({
      data: {
        accountStatus: (options.status ?? 'ACTIVE') as never,
        email: `${this.label}-${this.suffix}-${n}@healix.test`,
        fullName: `Test ${this.label} ${n}`,
        passwordHash: options.password
          ? await hash(options.password, 4)
          : 'not-a-real-hash',
        phone: `${this.label}-${this.suffix}-${n}`,
        role,
      },
    });
    this.created.users.push(row.id);
    return row;
  }

  // A private practice: its workspace, its owner membership.
  async privatePracticeWorkspace(doctorProfileId: string, ownerId: string) {
    const workspace = await this.prisma.workspace.create({
      data: {
        name: `Cabinet ${this.suffix}`,
        ownerDoctorProfileId: doctorProfileId,
        type: 'PRIVATE_PRACTICE',
      },
    });
    this.created.workspaces.push(workspace.id);
    await this.prisma.workspaceMembership.create({
      data: { role: 'OWNER', userId: ownerId, workspaceId: workspace.id },
    });
    return workspace;
  }

  // A plan of the catalog, registered when the test database was not seeded
  // (and with the quotas of the catalog when it was).
  async plan(code: string) {
    const entry = SUBSCRIPTION_PLAN_CATALOG.find((plan) => plan.code === code);

    if (!entry) {
      throw new Error('Unknown plan ' + code);
    }

    const data = {
      accountType: entry.accountType,
      active: true,
      annualPrice: entry.annualPrice,
      custom: entry.custom,
      description: entry.description,
      features: [...entry.features],
      limits: [...entry.limits],
      monthlyPrice: entry.monthlyPrice,
      name: entry.name,
      quotas: { ...entry.quotas },
      recommended: entry.recommended,
    };
    // Specs run in parallel on one database: two may create it at once.
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await this.prisma.subscriptionPlan.upsert({
          create: { ...data, code, currency: 'DZD' },
          update: data,
          where: { code },
        });
      } catch (error) {
        if (attempt >= 2) throw error;
      }
    }
  }

  // The subscription of an account (the row the entitlements are read from).
  async subscription(
    userId: string,
    accountType: 'ESTABLISHMENT' | 'INDEPENDENT_DOCTOR',
    options: FixtureSubscription = {},
  ) {
    const plan = await this.plan(
      options.plan ??
        (accountType === 'ESTABLISHMENT' ? 'EST_BASIC_CLINIC' : 'DOCTOR_PRO'),
    );

    return this.prisma.subscription.create({
      data: {
        accountType,
        billingPeriod: 'MONTHLY',
        customQuotas: options.customQuotas
          ? { ...options.customQuotas }
          : undefined,
        expiresAt: options.expiresAt ?? new Date(Date.now() + 365 * 86_400_000),
        planId: plan.id,
        startedAt: options.startedAt ?? new Date(Date.now() - 86_400_000),
        status: (options.status ?? 'ACTIVE') as never,
        trial: options.trial ?? false,
        userId,
      },
    });
  }

  // An independent doctor who can prescribe and sign: verified, subscribed
  // (a live subscription, or the one given; false for none), with the order
  // number and the regional council the documents print. The subscription is
  // created before the profile: the migration's backfill (run by a spec on
  // the same database) never finds a verified doctor without one.
  async independentDoctor(
    options: {
      password?: string;
      subscription?: FixtureSubscription | false;
    } = {},
  ) {
    const user = await this.user('INDEPENDENT_DOCTOR', options);
    const n = this.counter;
    const subscription =
      options.subscription === false
        ? null
        : await this.subscription(
            user.id,
            'INDEPENDENT_DOCTOR',
            options.subscription,
          );
    const profile = await this.prisma.doctorProfile.create({
      data: {
        isIndependent: true,
        professionalAddress: '12 rue Didouche Mourad, Alger',
        speciality: 'Médecine interne',
        subscriptionStatus: (subscription?.status ?? 'NO_PLAN') as never,
        userId: user.id,
        verificationStatus: 'VERIFIED',
        wilaya: 'Alger',
      },
    });
    await this.prisma.verificationRequest.create({
      data: {
        doctorData: {
          create: {
            cabinetAddress: '12 rue Didouche Mourad, Alger',
            cabinetName: `Cabinet du Dr Test ${n}`,
            cabinetPhone: '0550000000',
            cabinetWilaya: 'Alger',
            fullName: user.fullName,
            orderRegistrationNumber: `ORD-${this.suffix}-${n}`,
            phone: '0550000000',
            professionalEmail: user.email,
            regionalCouncil: "Conseil régional d'Alger",
            registrationWilaya: 'Alger',
            speciality: 'Médecine interne',
            wilaya: 'Alger',
          },
        },
        doctorProfileId: profile.id,
        status: 'VERIFIED',
        type: 'INDEPENDENT_DOCTOR',
        userId: user.id,
      },
    });
    const workspace = await this.privatePracticeWorkspace(profile.id, user.id);
    return {
      actor: this.actor(user),
      profile,
      subscription,
      user,
      workspace,
    };
  }

  // An establishment with its owner, its workspace and affiliated doctors,
  // who work under the owner's subscription (they have none of their own).
  async establishmentWithDoctors(
    doctorCount: number,
    options: { subscription?: FixtureSubscription | false } = {},
  ) {
    const owner = await this.user('ESTABLISHMENT_ADMIN');
    const subscription =
      options.subscription === false
        ? null
        : await this.subscription(
            owner.id,
            'ESTABLISHMENT',
            options.subscription,
          );
    const establishment = await this.prisma.establishment.create({
      data: {
        address: '1 rue de la Santé, Alger',
        managerFullName: owner.fullName,
        name: 'Clinique ' + this.suffix + '-' + this.counter,
        ownerId: owner.id,
        phone: '0550000000',
        professionalEmail: owner.email,
        subscriptionStatus: (subscription?.status ?? 'NO_PLAN') as never,
        type: 'CLINIC',
        verificationStatus: 'VERIFIED',
        wilaya: 'Alger',
      },
    });
    const workspace = await this.prisma.workspace.create({
      data: {
        establishmentId: establishment.id,
        name: establishment.name,
        type: 'ESTABLISHMENT',
      },
    });
    this.created.workspaces.push(workspace.id);
    await this.prisma.workspaceMembership.create({
      data: { role: 'OWNER', userId: owner.id, workspaceId: workspace.id },
    });

    const doctors: {
      actor: AuthenticatedUserPayload;
      profile: { id: string };
      user: { id: string };
    }[] = [];
    for (let index = 0; index < doctorCount; index += 1) {
      const user = await this.user('AFFILIATED_DOCTOR');
      const profile = await this.prisma.doctorProfile.create({
        data: {
          establishmentId: establishment.id,
          isIndependent: false,
          professionalAddress: establishment.address,
          speciality: 'Médecine interne',
          subscriptionStatus: (subscription?.status ?? 'NO_PLAN') as never,
          userId: user.id,
          verificationStatus: 'VERIFIED',
          wilaya: 'Alger',
        },
      });
      await this.prisma.workspaceMembership.create({
        data: { role: 'DOCTOR', userId: user.id, workspaceId: workspace.id },
      });
      doctors.push({ actor: this.actor(user), profile, user });
    }

    return {
      doctors,
      establishment,
      owner,
      ownerActor: this.actor(owner),
      subscription,
      workspace,
    };
  }

  async patient(workspaceId: string, doctorProfileId: string) {
    const n = this.next();
    const row = await this.prisma.patient.create({
      data: {
        address: 'Alger',
        birthDate: new Date('1985-03-12T00:00:00Z'),
        commune: 'Alger',
        doctorProfileId,
        emergencyContactName: 'Contact',
        emergencyContactPhone: '0550000000',
        firstName: `Amina${n}`,
        firstNameAr: `أمينة${n}`,
        gender: 'FEMALE',
        hospitalRecordNumber: `DOS-${this.suffix}-${n}`,
        insurance: 'CNAS',
        lastName: `Benali${n}`,
        lastNameAr: `بن علي${n}`,
        nationalId: `NID-${this.suffix}-${n}`,
        phone: '0550000000',
        sector: 'PUBLIC',
        wilaya: 'Alger',
        workspaceId,
      },
    });
    this.created.patients.push(row.id);
    return row;
  }

  appointment(
    patientId: string,
    doctorProfileId: string,
    createdById: string,
    scheduledAt: Date,
    status = 'CONFIRMED',
  ) {
    return this.prisma.appointment.create({
      data: {
        createdById,
        doctorProfileId,
        patientId,
        reason: 'Douleur thoracique',
        scheduledAt,
        status: status as never,
      },
    });
  }

  // Everything of this run, in the order the foreign keys impose: documents
  // and newer versions before what they hang on, then the patients (their
  // runs, consultations and appointments go with them), the workspaces and
  // the users.
  async cleanup(): Promise<void> {
    const { patients, users, workspaces } = this.created;
    const scope = {
      OR: [
        { patientId: { in: patients } },
        { workspaceId: { in: workspaces } },
      ],
    };

    const reports = await this.prisma.clinicalReport.findMany({
      select: { id: true, replacesId: true },
      where: scope,
    });
    const reportIds = reports.map((report) => report.id);
    await this.prisma.clinicalReportDocument.deleteMany({
      where: { reportId: { in: reportIds } },
    });
    // A version is deleted after the ones that replace it.
    let remaining = reports;
    while (remaining.length > 0) {
      const replaced = new Set(remaining.map((report) => report.replacesId));
      const leaves = remaining.filter((report) => !replaced.has(report.id));
      await this.prisma.clinicalReport.deleteMany({
        where: { id: { in: leaves.map((report) => report.id) } },
      });
      remaining = remaining.filter((report) => replaced.has(report.id));
    }

    const prescriptions = await this.prisma.prescription.findMany({
      select: { basedOnPrescriptionId: true, id: true },
      where: scope,
    });
    const prescriptionIds = prescriptions.map((row) => row.id);
    await this.prisma.prescriptionDocument.deleteMany({
      where: { prescriptionId: { in: prescriptionIds } },
    });
    await this.prisma.patientDocument.deleteMany({
      where: { prescriptionId: { in: prescriptionIds } },
    });
    let renewals = prescriptions;
    while (renewals.length > 0) {
      const based = new Set(renewals.map((row) => row.basedOnPrescriptionId));
      const leaves = renewals.filter((row) => !based.has(row.id));
      await this.prisma.prescription.deleteMany({
        where: { id: { in: leaves.map((row) => row.id) } },
      });
      renewals = renewals.filter((row) => based.has(row.id));
    }

    // The consultation fences the patient in (Restrict): it goes first.
    // Its vital signs, diagnoses and addenda hang on it with Cascades, and
    // the appointment it summarizes is cascaded by the patient right after.
    await this.prisma.patientConsultation.deleteMany({
      where: { patientId: { in: patients } },
    });
    await this.prisma.patient.deleteMany({ where: { id: { in: patients } } });

    // The offline domain points at users, workspaces and devices with
    // Restrict rules: it is removed before them, device by device.
    const deviceIds = (
      await this.prisma.offlineDevice.findMany({
        where: { userId: { in: users }, workspaceId: { in: workspaces } },
        select: { id: true },
      })
    ).map((device) => device.id);
    await this.prisma.syncDeviceState.deleteMany({
      where: { deviceId: { in: deviceIds } },
    });
    await this.prisma.syncOperation.deleteMany({
      where: { deviceId: { in: deviceIds } },
    });
    await this.prisma.syncEntityMap.deleteMany({
      where: { deviceId: { in: deviceIds } },
    });
    await this.prisma.offlineAccessGrant.deleteMany({
      where: { deviceId: { in: deviceIds } },
    });
    if (deviceIds.length > 0) {
      await this.prisma.deviceRequestNonce.deleteMany({
        where: { deviceId: { in: deviceIds } },
      });
      await this.prisma.offlineDevice.deleteMany({
        where: { id: { in: deviceIds } },
      });
    }

    await this.prisma.workspace.deleteMany({
      where: { id: { in: workspaces } },
    });
    await this.prisma.auditLog.deleteMany({
      where: { userId: { in: users } },
    });
    // A payment points at the subscription it activated: it goes first.
    await this.prisma.payment.deleteMany({ where: { userId: { in: users } } });
    await this.prisma.user.deleteMany({ where: { id: { in: users } } });
  }
}
