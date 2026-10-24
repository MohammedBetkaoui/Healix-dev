import { hash } from 'bcrypt';

import { type AuthenticatedUserPayload } from '../../auth/types/authenticated-request.type';
import { type PrismaService } from '../../prisma/prisma.service';

// What the integration specs share: the test database they run on, and the
// rows they need (user, workspace, doctor, patient, appointment), created
// with a suffix of their own and removed by cleanup(). Specs only.

export type TestDatabase = { name: string; url: string };

// TEST_DATABASE_URL, null when it is not set (the spec is then skipped).
export function readTestDatabase(
  env: Record<string, string | undefined> = process.env,
): TestDatabase | null {
  const url = env.TEST_DATABASE_URL ?? '';
  return url ? { name: new URL(url).pathname.slice(1), url } : null;
}

// A spec writes and deletes rows: only a database made for it.
export function assertTestDatabaseName(database: TestDatabase): void {
  if (!database.name.endsWith('_test')) {
    throw new Error(
      `TEST_DATABASE_URL must name a database ending in "_test", not "${database.name}".`,
    );
  }
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

  // An independent doctor who can prescribe and sign: verified, subscribed,
  // with the order number and the regional council the documents print.
  async independentDoctor(options: { password?: string } = {}) {
    const user = await this.user('INDEPENDENT_DOCTOR', options);
    const n = this.counter;
    const profile = await this.prisma.doctorProfile.create({
      data: {
        isIndependent: true,
        professionalAddress: '12 rue Didouche Mourad, Alger',
        speciality: 'Médecine interne',
        subscriptionStatus: 'ACTIVE',
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
    return { actor: this.actor(user), profile, user, workspace };
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

    await this.prisma.patient.deleteMany({ where: { id: { in: patients } } });
    await this.prisma.workspace.deleteMany({
      where: { id: { in: workspaces } },
    });
    await this.prisma.auditLog.deleteMany({
      where: { userId: { in: users } },
    });
    await this.prisma.user.deleteMany({ where: { id: { in: users } } });
  }
}
