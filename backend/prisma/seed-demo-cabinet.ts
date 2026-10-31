import 'dotenv/config';

import { ConfigService } from '@nestjs/config';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { type Prisma, PrismaClient, SyncChangeOperation } from '@prisma/client';
import * as bcrypt from 'bcrypt';

import { PrescriptionRegulatoryService } from '../src/prescriptions/prescription-regulatory.service';
import { SUBSCRIPTION_PLAN_CATALOG } from '../src/subscriptions/plans/plan-catalog';
import { recordAppointmentSyncChange } from '../src/sync/appointment-sync-change';
import { recordConsultationSyncChange } from '../src/sync/consultation-sync-change';
import { recordPrescriptionSyncChange } from '../src/sync/prescription-sync-change';
import {
  algiersInstant,
  assertSeedAllowed,
  DEMO_CONSULTATIONS,
  DEMO_AI_RUNS,
  DEMO_DOCTOR,
  DEMO_MEDICATIONS,
  DEMO_PATIENTS,
  DEMO_PRESCRIPTION,
  demoAppointmentsFor,
  demoVolumetry,
  fingerprint,
  resolveSeedDay,
} from './demo-cabinet-data';

// A complete demo cabinet for the Desktop presentation (docs/demo-soutenance.md):
// "Dr Démonstration", eight patients, five appointments today, three past
// consultations, a validated prescription and three AI analyses the doctor
// already decided (brain MRI validated, breast pathology corrected, cardiac
// volumetry validated with an ejection fraction of 52 %). Idempotent: every row has a fixed
// id and is created or updated, so it can be run again (the day before, and
// again on the morning of the presentation). Every run also records the rows in
// the synchronization feed, so that a Desktop that already holds the cabinet
// receives today's appointments and the validated prescription at its next
// synchronization.
//
//   npm run seed:demo
//
// Environment: DATABASE_URL (required), DEMO_DOCTOR_PASSWORD (the password of
// the demo doctor; the default is printed at the end), DEMO_SLOT_SHIFT_MINUTES
// (shifts the appointments, to rehearse in the afternoon), DEMO_SEED_DAY
// (YYYY-MM-DD: the day of the presentation, to prepare it the day before;
// default today in Algiers). Refused when
// NODE_ENV=production unless ALLOW_DEMO_SEED=1.

// Set by main(), once the environment has been checked.
let day = '';
const shift = Number(process.env.DEMO_SLOT_SHIFT_MINUTES ?? 0) || 0;
const at = (time: string, dayOffset = 0) =>
  algiersInstant(day, time, dayOffset, shift);

async function main() {
  assertSeedAllowed(process.env);
  day = resolveSeedDay(process.env);
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error('DATABASE_URL est requis.');
  const prisma = new PrismaClient({ adapter: new PrismaMariaDb(url) });
  try {
    await seed(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

async function seed(prisma: PrismaClient) {
  // -- plan, medications ----------------------------------------------------
  const planEntry = SUBSCRIPTION_PLAN_CATALOG.find(
    (plan) => plan.code === 'DOCTOR_PRO',
  );
  if (!planEntry) throw new Error('Plan DOCTOR_PRO introuvable.');
  const planData = {
    accountType: planEntry.accountType,
    active: true,
    annualPrice: planEntry.annualPrice,
    currency: 'DZD',
    custom: planEntry.custom,
    description: planEntry.description,
    features: [...planEntry.features],
    limits: [...planEntry.limits],
    monthlyPrice: planEntry.monthlyPrice,
    name: planEntry.name,
    quotas: { ...planEntry.quotas },
    recommended: planEntry.recommended,
  };
  const plan = await prisma.subscriptionPlan.upsert({
    where: { code: planEntry.code },
    create: { ...planData, code: planEntry.code },
    update: planData,
  });
  for (const medication of DEMO_MEDICATIONS) {
    const data = {
      ...medication,
      brandName: null,
      manufacturer: null,
      pharmaceuticalForm: 'TABLET' as const,
      route: 'ORAL' as const,
      regulatoryCategory: 'STANDARD' as const,
      source: 'DEMO',
      reimbursable: 'UNKNOWN' as const,
      requiresPriorApproval: 'UNKNOWN' as const,
    };
    await prisma.medicationReference.upsert({
      where: { id: medication.id },
      create: data,
      update: { ...data, active: true },
    });
  }

  // -- the doctor -----------------------------------------------------------
  const password =
    process.env.DEMO_DOCTOR_PASSWORD?.trim() || DEMO_DOCTOR.defaultPassword;
  let user = await prisma.user.findUnique({
    where: { email: DEMO_DOCTOR.email },
  });
  if (!user) {
    user = await prisma.user.create({
      data: {
        accountStatus: 'ACTIVE',
        email: DEMO_DOCTOR.email,
        fullName: DEMO_DOCTOR.fullName,
        isEmailVerified: true,
        isPhoneVerified: true,
        passwordHash: await bcrypt.hash(password, 12),
        phone: DEMO_DOCTOR.phone,
        role: 'INDEPENDENT_DOCTOR',
      },
    });
  } else {
    user = await prisma.user.update({
      where: { id: user.id },
      data: { accountStatus: 'ACTIVE', fullName: DEMO_DOCTOR.fullName },
    });
  }
  const subscription = await prisma.subscription.findFirst({
    where: { userId: user.id, status: 'ACTIVE' },
  });
  if (!subscription || (subscription.expiresAt?.getTime() ?? 0) < Date.now()) {
    await prisma.subscription.create({
      data: {
        accountType: 'INDEPENDENT_DOCTOR',
        billingPeriod: 'MONTHLY',
        expiresAt: new Date(Date.now() + 365 * 86_400_000),
        planId: plan.id,
        startedAt: new Date(Date.now() - 86_400_000),
        status: 'ACTIVE',
        userId: user.id,
      },
    });
  }
  const profileData = {
    isIndependent: true,
    professionalAddress: DEMO_DOCTOR.professionalAddress,
    speciality: DEMO_DOCTOR.speciality,
    subscriptionStatus: 'ACTIVE' as const,
    verificationStatus: 'VERIFIED' as const,
    wilaya: DEMO_DOCTOR.wilaya,
  };
  const profile = await prisma.doctorProfile.upsert({
    where: { userId: user.id },
    create: { ...profileData, userId: user.id },
    update: profileData,
  });
  const doctorData = {
    cabinetAddress: DEMO_DOCTOR.professionalAddress,
    cabinetName: DEMO_DOCTOR.cabinetName,
    cabinetPhone: DEMO_DOCTOR.cabinetPhone,
    cabinetWilaya: DEMO_DOCTOR.wilaya,
    fullName: DEMO_DOCTOR.fullName,
    orderRegistrationNumber: DEMO_DOCTOR.orderRegistrationNumber,
    phone: DEMO_DOCTOR.phone,
    professionalEmail: DEMO_DOCTOR.email,
    regionalCouncil: DEMO_DOCTOR.regionalCouncil,
    registrationWilaya: DEMO_DOCTOR.registrationWilaya,
    speciality: DEMO_DOCTOR.speciality,
    wilaya: DEMO_DOCTOR.wilaya,
  };
  const verification = await prisma.verificationRequest.findFirst({
    where: { doctorProfileId: profile.id },
    include: { doctorData: true },
  });
  if (!verification) {
    await prisma.verificationRequest.create({
      data: {
        doctorData: { create: doctorData },
        doctorProfileId: profile.id,
        status: 'VERIFIED',
        type: 'INDEPENDENT_DOCTOR',
        userId: user.id,
      },
    });
  } else if (verification.doctorData) {
    await prisma.doctorVerificationData.update({
      where: { id: verification.doctorData.id },
      data: doctorData,
    });
  }
  let workspace = await prisma.workspace.findUnique({
    where: { ownerDoctorProfileId: profile.id },
  });
  if (!workspace) {
    workspace = await prisma.workspace.create({
      data: {
        name: DEMO_DOCTOR.cabinetName,
        ownerDoctorProfileId: profile.id,
        type: 'PRIVATE_PRACTICE',
      },
    });
  }
  await prisma.workspaceMembership.upsert({
    where: {
      workspaceId_userId: { userId: user.id, workspaceId: workspace.id },
    },
    create: { role: 'OWNER', userId: user.id, workspaceId: workspace.id },
    update: { status: 'ACTIVE' },
  });

  // -- patients -------------------------------------------------------------
  for (const [index, patient] of DEMO_PATIENTS.entries()) {
    const n = index + 1;
    const data = {
      address: `${n} cité des 1 000 logements`,
      birthDate: new Date(`${patient.birthDate}T00:00:00.000Z`),
      bloodGroup: patient.bloodGroup,
      commune: patient.commune,
      doctorProfileId: profile.id,
      email: null,
      emergencyContactName: 'Contact de démonstration',
      emergencyContactPhone: `055000010${n}`,
      firstName: patient.firstName,
      firstNameAr: patient.firstNameAr,
      gender: patient.gender,
      hospitalRecordNumber: `HD-DEMO-${String(n).padStart(4, '0')}`,
      insurance: patient.insurance,
      insuredNumber: null,
      lastName: patient.lastName,
      lastNameAr: patient.lastNameAr,
      medicalSummary: patient.medicalSummary,
      nationalId: `DEMO-${String(n).padStart(8, '0')}`,
      phone: `055000020${n}`,
      sector: 'PRIVATE' as const,
      status: patient.status,
      wilaya: DEMO_DOCTOR.wilaya,
      workspaceId: workspace.id,
    };
    await prisma.patient.upsert({
      where: { id: patient.id },
      create: { ...data, id: patient.id },
      update: data,
    });
  }

  // -- appointments today ---------------------------------------------------
  const appointmentIds: Array<{ id: string; created: boolean }> = [];
  for (const slot of demoAppointmentsFor(day)) {
    const existed = await prisma.appointment.findUnique({
      where: { id: slot.id },
      select: { id: true },
    });
    const data = {
      createdById: user.id,
      doctorProfileId: profile.id,
      durationMinutes: slot.durationMinutes,
      patientId: slot.patientId,
      reason: slot.reason,
      scheduledAt: at(slot.time),
      status: slot.status,
    };
    await prisma.appointment.upsert({
      where: { id: slot.id },
      create: { ...data, id: slot.id },
      update: data,
    });
    appointmentIds.push({ id: slot.id, created: !existed });
  }

  // -- past consultations ---------------------------------------------------
  const consultationIds: Array<{ id: string; created: boolean }> = [];
  for (const consultation of DEMO_CONSULTATIONS) {
    const startedAt = at(consultation.time, consultation.dayOffset);
    const existed = await prisma.patientConsultation.findUnique({
      where: { id: consultation.id },
      select: { id: true },
    });
    const appointmentId = consultation.appointmentSlot
      ? `demo-appointment-${day}-${consultation.appointmentSlot}`
      : null;
    const scalars = {
      appointmentId,
      assessment: consultation.assessment,
      carePlan: consultation.carePlan,
      chiefComplaint: consultation.chiefComplaint,
      clinicalExamination: consultation.clinicalExamination,
      completedAt: new Date(startedAt.getTime() + 20 * 60_000),
      completedById: user.id,
      createdById: user.id,
      doctorProfileId: profile.id,
      followUpPlan: consultation.followUpPlan,
      historyPresentIllness: consultation.historyPresentIllness,
      patientId: consultation.patientId,
      startedAt,
      status: 'COMPLETED' as const,
      workspaceId: workspace.id,
    };
    if (!existed) {
      await prisma.patientConsultation.create({
        data: {
          ...scalars,
          id: consultation.id,
          createdAt: startedAt,
          vitalSigns: { create: consultation.vitalSigns },
          diagnoses: { create: consultation.diagnoses },
        },
      });
    } else {
      // A consultation already completed is only brought up to date: the
      // appointment link follows today's date, the rest is as it was written.
      await prisma.patientConsultation.update({
        where: { id: consultation.id },
        data: { appointmentId },
      });
    }
    consultationIds.push({ id: consultation.id, created: !existed });
  }

  // -- one validated prescription -------------------------------------------
  const prescribedAt = at(DEMO_PRESCRIPTION.time, DEMO_PRESCRIPTION.dayOffset);
  let prescriptionCreated = false;
  const existingPrescription = await prisma.prescription.findUnique({
    where: { id: DEMO_PRESCRIPTION.id },
    select: { id: true },
  });
  if (!existingPrescription) {
    const patient = DEMO_PATIENTS.find(
      (entry) => entry.id === DEMO_PRESCRIPTION.patientId,
    )!;
    const patientRow = await prisma.patient.findUniqueOrThrow({
      where: { id: patient.id },
    });
    const patientSnapshot = {
      firstName: patientRow.firstName,
      firstNameAr: patientRow.firstNameAr,
      lastName: patientRow.lastName,
      lastNameAr: patientRow.lastNameAr,
      birthDate: patientRow.birthDate.toISOString(),
      gender: patientRow.gender,
      hospitalRecordNumber: patientRow.hospitalRecordNumber,
      address: patientRow.address,
      wilaya: patientRow.wilaya,
    };
    const prescriberSnapshot = {
      fullName: DEMO_DOCTOR.fullName,
      speciality: DEMO_DOCTOR.speciality,
      registrationNumber: DEMO_DOCTOR.orderRegistrationNumber,
      regionalCouncil: DEMO_DOCTOR.regionalCouncil,
      registrationWilaya: DEMO_DOCTOR.registrationWilaya,
      professionalAddress: DEMO_DOCTOR.professionalAddress,
      professionalPhone: DEMO_DOCTOR.cabinetPhone,
    };
    const organizationSnapshot = {
      id: null,
      name: DEMO_DOCTOR.cabinetName,
      address: DEMO_DOCTOR.professionalAddress,
      wilaya: DEMO_DOCTOR.wilaya,
      phone: DEMO_DOCTOR.cabinetPhone,
    };
    const regulatorySnapshot = new PrescriptionRegulatoryService(
      new ConfigService(),
    ).finalize({
      requestedType: 'STANDARD',
      categories: DEMO_PRESCRIPTION.items.map(
        (item) => item.regulatoryCategory,
      ),
      regulatoryData: null,
      prescriberRegistrationNumber: DEMO_DOCTOR.orderRegistrationNumber,
    });
    const items = DEMO_PRESCRIPTION.items.map((item, position) => ({
      ...item,
      position,
      manufacturer: null,
      indication: null,
      asNeeded: false,
      renewalAllowed: false,
      substitutionAllowed: true,
    }));
    const contentFingerprint = fingerprint({
      number: DEMO_PRESCRIPTION.number,
      patient: patientSnapshot,
      prescriber: prescriberSnapshot,
      organization: organizationSnapshot,
      prescribedAt,
      type: regulatorySnapshot.category,
      items,
      regulatory: regulatorySnapshot,
    });
    await prisma.prescription.create({
      data: {
        id: DEMO_PRESCRIPTION.id,
        number: DEMO_PRESCRIPTION.number,
        workspaceId: workspace.id,
        patientId: patient.id,
        prescriberDoctorProfileId: profile.id,
        encounterId: 'demo-consultation-2',
        createdById: user.id,
        status: 'VALIDATED',
        type: 'STANDARD',
        prescribedAt,
        validatedAt: prescribedAt,
        validatedById: user.id,
        patientSnapshot,
        prescriberSnapshot,
        organizationSnapshot,
        insuranceSnapshot: {
          organization: patientRow.insurance,
          insuredNumber: patientRow.insuredNumber,
          sector: patientRow.sector,
        },
        regulatorySnapshot,
        contentFingerprint,
        items: { create: items },
      },
    });
    prescriptionCreated = true;
  }

  // -- three decided AI analyses ---------------------------------------------
  // Rows only: no image, no mask, no PDF (the source document and the report
  // have no file). The Desktop reads them from GET /sync/ai-reports, which is not
  // part of the synchronization feed: nothing to record below for them.
  for (const demo of DEMO_AI_RUNS) {
    const decidedAt = at(demo.time, demo.dayOffset);
    await prisma.patientDocument.upsert({
      where: { id: demo.documentId },
      create: {
        id: demo.documentId,
        patientId: demo.patientId,
        documentType: demo.documentType,
        originalName: demo.documentName,
        storedName: demo.documentName,
        mimeType: demo.documentMimeType,
        size: 0,
        uploadedById: user.id,
      },
      update: { patientId: demo.patientId },
    });
    const run = {
      patientId: demo.patientId,
      sourceDocumentId: demo.documentId,
      pipeline: demo.pipeline,
      status: 'SUCCEEDED' as const,
      classificationModelId: demo.classificationModelId,
      segmentationModelId: demo.segmentationModelId,
      volumetry:
        demo.pipeline === 'cardio-volume-mri'
          ? (demoVolumetry() as unknown as Prisma.InputJsonValue)
          : undefined,
      clinicianImpression: demo.clinicianImpression,
      requestedById: user.id,
      decisionStatus: demo.decisionStatus,
      decisionLabel: demo.decisionLabel,
      decisionReason: demo.decisionReason,
      decidedById: user.id,
      decidedAt,
      createdAt: new Date(decidedAt.getTime() - 3 * 60_000),
      ...demo.columns,
    };
    await prisma.aiAnalysisRun.upsert({
      where: { id: demo.id },
      create: { ...run, id: demo.id },
      update: run,
    });
    const reportData = {
      reportNumber: demo.reportNumber,
      sha256: fingerprint(`demo-report-file:${demo.id}`),
      contentSha256: fingerprint(`demo-report-content:${demo.id}`),
      sizeBytes: 0,
      generatedById: user.id,
      createdAt: new Date(decidedAt.getTime() + 60_000),
    };
    await prisma.aiAnalysisReport.upsert({
      where: { runId: demo.id },
      create: { ...reportData, runId: demo.id },
      update: reportData,
    });
  }

  // -- the synchronization feed ----------------------------------------------
  // So that a Desktop which already holds the cabinet gets today's rows and the
  // validated prescription at its next synchronization (a validated
  // prescription is never in a bootstrap, only in the feed).
  const feedOperation = (created: boolean) =>
    created ? SyncChangeOperation.CREATE : SyncChangeOperation.UPDATE;
  for (const entry of appointmentIds) {
    await recordAppointmentSyncChange(
      prisma,
      entry.id,
      feedOperation(entry.created),
    );
  }
  for (const entry of consultationIds) {
    await recordConsultationSyncChange(
      prisma,
      entry.id,
      feedOperation(entry.created),
    );
  }
  await recordPrescriptionSyncChange(
    prisma,
    DEMO_PRESCRIPTION.id,
    feedOperation(prescriptionCreated),
  );

  console.log(
    [
      '',
      'Cabinet de démonstration prêt.',
      `  Médecin   : ${DEMO_DOCTOR.fullName} <${DEMO_DOCTOR.email}>`,
      `  Mot de passe : ${process.env.DEMO_DOCTOR_PASSWORD?.trim() ? '(celui de DEMO_DOCTOR_PASSWORD)' : DEMO_DOCTOR.defaultPassword}`,
      `  Patients  : ${DEMO_PATIENTS.length}   Rendez-vous aujourd’hui (${day}) : ${appointmentIds.length}`,
      `  Consultations passées : ${consultationIds.length}   Ordonnance validée : ${DEMO_PRESCRIPTION.number}`,
      `  Analyses IA décidées : ${DEMO_AI_RUNS.length} (cerveau, sein, cœur)`,
      '',
    ].join('\n'),
  );
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : 'Seed de démonstration échoué.',
  );
  process.exit(1);
});
