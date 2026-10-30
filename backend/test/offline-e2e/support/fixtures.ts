import {
  IntegrationFixtures,
  TEST_PASSWORD,
} from '../../../src/common/testing/integration-fixtures';
import { type PrismaService } from '../../../src/prisma/prisma.service';
import { E2E_MEDICATION_ID } from './operations';

// Synthetic data only: fictitious doctors, patients "E2E Alpha" / "E2E Beta",
// a made-up medication. Nothing here resembles a real person or record.

export class OfflineE2EFixtures extends IntegrationFixtures {
  constructor(private readonly db: PrismaService) {
    super(db, 'offline-e2e');
  }

  async namedPatient(
    workspaceId: string,
    doctorProfileId: string,
    lastName: string,
  ) {
    const patient = await this.patient(workspaceId, doctorProfileId);
    return this.db.patient.update({
      where: { id: patient.id },
      data: {
        firstName: 'E2E',
        lastName,
        firstNameAr: 'اختبار',
        lastNameAr: lastName,
      },
    });
  }

  // A private practice: one independent doctor who can sign in, a workspace
  // and two fictitious patients.
  async clinic(label: string) {
    const doctor = await this.independentDoctor({ password: TEST_PASSWORD });
    const alpha = await this.namedPatient(
      doctor.workspace.id,
      doctor.profile.id,
      `Alpha ${label}`,
    );
    const beta = await this.namedPatient(
      doctor.workspace.id,
      doctor.profile.id,
      `Beta ${label}`,
    );
    return {
      doctor,
      workspaceId: doctor.workspace.id,
      credentials: { email: doctor.user.email, password: TEST_PASSWORD },
      alpha,
      beta,
    };
  }

  // The medication catalog is global and idempotent: one made-up entry.
  async ensureMedication() {
    await this.db.medicationReference.upsert({
      where: { id: E2E_MEDICATION_ID },
      create: {
        id: E2E_MEDICATION_ID,
        dci: 'Paracétamol E2E',
        brandName: null,
        strength: '500 mg',
        pharmaceuticalForm: 'TABLET',
        route: 'ORAL',
        regulatoryCategory: 'STANDARD',
        source: 'offline-e2e',
        active: true,
      },
      update: { active: true },
    });
  }

  // A consultation that already exists on the Cloud (created from the web).
  async cloudConsultation(
    clinic: {
      workspaceId: string;
      doctor: { profile: { id: string }; user: { id: string } };
    },
    patientId: string,
    chiefComplaint: string,
  ) {
    return this.db.patientConsultation.create({
      data: {
        workspaceId: clinic.workspaceId,
        patientId,
        doctorProfileId: clinic.doctor.profile.id,
        createdById: clinic.doctor.user.id,
        status: 'DRAFT',
        chiefComplaint,
      },
    });
  }

  // A prescription DRAFT that already exists on the Cloud.
  async cloudPrescriptionDraft(
    clinic: {
      workspaceId: string;
      doctor: { profile: { id: string }; user: { id: string } };
    },
    patientId: string,
  ) {
    return this.db.prescription.create({
      data: {
        workspaceId: clinic.workspaceId,
        patientId,
        prescriberDoctorProfileId: clinic.doctor.profile.id,
        createdById: clinic.doctor.user.id,
        status: 'DRAFT',
        items: {
          create: [
            {
              position: 1,
              medicationId: E2E_MEDICATION_ID,
              dci: 'Paracétamol E2E',
              strength: '500 mg',
              pharmaceuticalForm: 'TABLET',
              route: 'ORAL',
              regulatoryCategory: 'STANDARD',
              dosePerIntake: '1 comprimé',
              frequency: '3 fois par jour',
              quantity: '1 boîte',
            },
          ],
        },
      },
    });
  }
}

export { TEST_PASSWORD };
