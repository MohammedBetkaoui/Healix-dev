/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { UserRole } from '../common/enums/user-role.enum';
import { type OfflineActor } from '../offline-devices/offline-device.types';
import { type PrismaService } from '../prisma/prisma.service';
import {
  organizationSnapshot,
  toPrintIdentity,
} from '../prescriptions/prescriber-identity';
import { type OfflineScopeService } from './offline-scope.service';
import { type PrescriptionSyncService } from './prescription-sync.service';
import { prescriptionSyncSelect } from './prescription-sync-change';
import { SyncService } from './sync.service';

const actor = {
  grantId: 'grant-1',
  userId: 'user-1',
  deviceId: 'device-1',
  workspaceId: 'workspace-1',
  role: UserRole.INDEPENDENT_DOCTOR,
  offlineCapabilities: {},
  offlineScope: {
    policy: 'PRIVATE_PRACTICE_ACTIVE',
    recentConsultationDays: 90,
    upcomingAppointmentDays: 30,
  },
} as unknown as OfflineActor;

const PERSONAL_PHONE = '0555-PERSONAL';
const CABINET_PHONE = '0550-CABINET';

const independent = {
  fullName: 'Dr Démonstration',
  phone: PERSONAL_PHONE,
  doctorProfile: {
    speciality: 'Médecine générale',
    professionalAddress: '12 rue des Frères Bouadou',
    wilaya: 'Bordj Bou Arréridj',
    establishment: null,
    verificationRequest: {
      doctorData: {
        orderRegistrationNumber: '34/1234',
        regionalCouncil: 'Conseil régional de Sétif',
        cabinetName: 'Cabinet du Dr Démonstration',
        cabinetAddress: '12 rue des Frères Bouadou',
        cabinetWilaya: 'Bordj Bou Arréridj',
        cabinetPhone: CABINET_PHONE,
      },
    },
  },
};

describe('what the desktop prints on a prescription, from the bootstrap', () => {
  it('has the five lines of the prescriber block and the four of the organization block, nothing else', () => {
    const identity = toPrintIdentity(independent);
    expect(identity.prescriber).toEqual({
      fullName: 'Dr Démonstration',
      speciality: 'Médecine générale',
      registrationNumber: '34/1234',
      regionalCouncil: 'Conseil régional de Sétif',
      professionalAddress: '12 rue des Frères Bouadou',
    });
    expect(identity.organization).toEqual({
      name: 'Cabinet du Dr Démonstration',
      address: '12 rue des Frères Bouadou',
      wilaya: 'Bordj Bou Arréridj',
      phone: CABINET_PHONE,
    });
    expect(Object.keys(identity.prescriber!)).toHaveLength(5);
    expect(Object.keys(identity.organization!)).toHaveLength(4);
  });

  it('uses the establishment for an affiliated doctor, without its id', () => {
    const identity = toPrintIdentity({
      ...independent,
      doctorProfile: {
        ...independent.doctorProfile,
        establishment: {
          id: 'establishment-1',
          name: 'Clinique El Feth',
          address: '4 avenue de l’Indépendance',
          wilaya: 'Sétif',
          phone: '036-000000',
        },
      },
    });
    expect(identity.organization).toEqual({
      name: 'Clinique El Feth',
      address: '4 avenue de l’Indépendance',
      wilaya: 'Sétif',
      phone: '036-000000',
    });
    expect(JSON.stringify(identity)).not.toContain('establishment-1');
  });

  it('falls back like the PDF does: own cabinet name and personal phone when the verification has none', () => {
    const profile = {
      establishment: null,
      professionalAddress: 'Adresse pro',
      wilaya: 'Alger',
    };
    const account = { fullName: 'Amina Haddad', phone: '0555-PERSONAL' };
    expect(organizationSnapshot(profile, account, null)).toEqual({
      id: null,
      name: 'Cabinet du Dr Amina Haddad',
      address: 'Adresse pro',
      wilaya: 'Alger',
      phone: '0555-PERSONAL',
    });
    const identity = toPrintIdentity({
      ...independent,
      doctorProfile: {
        ...independent.doctorProfile,
        verificationRequest: null,
      },
    });
    expect(identity.prescriber?.registrationNumber).toBeNull();
    expect(identity.prescriber?.regionalCouncil).toBeNull();
  });

  it('has no block for an account without a doctor profile', () => {
    expect(toPrintIdentity({ ...independent, doctorProfile: null })).toEqual({
      prescriber: null,
      organization: null,
    });
  });
});

describe('SyncService.bootstrap', () => {
  const scope = {
    resolve: jest.fn().mockResolvedValue({
      doctorProfileId: 'doctor-1',
      policy: 'PRIVATE_PRACTICE_ACTIVE',
      consultationWindowFrom: new Date('2026-07-30T00:00:00.000Z'),
      appointmentWindowFrom: new Date('2026-09-28T00:00:00.000Z'),
      appointmentWindowTo: new Date('2026-11-27T00:00:00.000Z'),
      patientIds: ['patient-1'],
    }),
  } as unknown as OfflineScopeService;

  const run = async () => {
    const findUser = jest
      .fn()
      // The first read is the user block, the second the identity to print.
      .mockImplementation((args: { select: Record<string, unknown> }) =>
        Promise.resolve(
          'role' in args.select
            ? {
                id: 'user-1',
                fullName: 'Dr Démonstration',
                email: 'demo@healixdz.dz',
                role: 'INDEPENDENT_DOCTOR',
              }
            : independent,
        ),
      );
    const transaction = {
      workspace: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'workspace-1',
          type: 'PRIVATE_PRACTICE',
          name: 'Cabinet Dr Démonstration',
          updatedAt: new Date('2026-10-28T00:00:00.000Z'),
        }),
      },
      user: { findUniqueOrThrow: findUser },
      patient: { findMany: jest.fn().mockResolvedValue([]) },
      patientConsultation: { findMany: jest.fn().mockResolvedValue([]) },
      appointment: { findMany: jest.fn().mockResolvedValue([]) },
      prescription: { findMany: jest.fn().mockResolvedValue([]) },
      syncChange: { findFirst: jest.fn().mockResolvedValue({ sequence: 7n }) },
    };
    const prisma = {
      $transaction: jest.fn(
        (work: (client: typeof transaction) => Promise<unknown>) =>
          work(transaction),
      ),
    } as unknown as PrismaService;
    const service = new SyncService(
      prisma,
      scope,
      {} as PrescriptionSyncService,
    );
    return { result: (await service.bootstrap(actor)) as any, transaction };
  };

  it('contains the prescriber and the organization blocks', async () => {
    const { result } = await run();
    expect(result.prescriber).toEqual({
      fullName: 'Dr Démonstration',
      speciality: 'Médecine générale',
      registrationNumber: '34/1234',
      regionalCouncil: 'Conseil régional de Sétif',
      professionalAddress: '12 rue des Frères Bouadou',
    });
    expect(result.organization).toEqual({
      name: 'Cabinet du Dr Démonstration',
      address: '12 rue des Frères Bouadou',
      wilaya: 'Bordj Bou Arréridj',
      phone: CABINET_PHONE,
    });
  });

  it('leaves the user block as it was and adds no other sensitive field', async () => {
    const { result } = await run();
    expect(result.user).toEqual({
      id: 'user-1',
      fullName: 'Dr Démonstration',
      email: 'demo@healixdz.dz',
      role: 'INDEPENDENT_DOCTOR',
    });
    // The personal phone of the doctor never leaves: only the cabinet's does.
    expect(JSON.stringify(result)).not.toContain(PERSONAL_PHONE);
    expect(Object.keys(result).sort()).toEqual(
      [
        'appointments',
        'authorizedPatientIds',
        'consultations',
        'deviceId',
        'offlineCapabilities',
        'offlineScope',
        'organization',
        'patients',
        'prescriber',
        'prescriptions',
        'serverTime',
        'syncCursor',
        'user',
        'workspace',
      ].sort(),
    );
  });

  it('reads the identity from the select of the shared source, in the same transaction', async () => {
    const { transaction } = await run();
    expect(transaction.user.findUniqueOrThrow).toHaveBeenCalledTimes(2);
    const selects = transaction.user.findUniqueOrThrow.mock.calls.map(
      ([args]: [{ select: Record<string, unknown> }]) =>
        Object.keys(args.select),
    );
    expect(selects).toContainEqual(['fullName', 'phone', 'doctorProfile']);
  });
});

describe('the prescription change feed', () => {
  it('carries the fingerprint of the content but none of the frozen snapshots', () => {
    const selected = Object.keys(prescriptionSyncSelect);
    expect(selected).toContain('contentFingerprint');
    for (const snapshot of [
      'patientSnapshot',
      'prescriberSnapshot',
      'organizationSnapshot',
      'insuranceSnapshot',
      'regulatorySnapshot',
      'clinicalContextSnapshot',
      'pdfStorageKey',
    ]) {
      expect(selected).not.toContain(snapshot);
    }
  });
});
