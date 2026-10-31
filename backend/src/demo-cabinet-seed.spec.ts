import 'reflect-metadata';

import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import {
  algiersDay,
  algiersInstant,
  assertSeedAllowed,
  canonicalize,
  DEMO_AI_RUNS,
  DEMO_CONSULTATIONS,
  DEMO_DOCTOR,
  DEMO_MEDICATIONS,
  DEMO_PATIENTS,
  DEMO_PRESCRIPTION,
  type DemoAiRun,
  demoAppointmentsFor,
  demoVolumetry,
  fingerprint,
  resolveSeedDay,
} from '../prisma/demo-cabinet-data';
import {
  effectiveMeasures,
  readVolumetry,
} from './ai-analysis-runs/volumetry/volumetry';
import { lvefClass } from './ai-analysis-runs/volumetry/volumetry-measures';
import { type AiReportRun, toAiReportSyncPayload } from './sync/ai-report-sync';
import { ConsultationVitalSignsDto } from './consultations/dto/update-consultation.dto';
import { PrescriptionSafetyService } from './prescriptions/prescription-safety.service';

describe('the demo cabinet seed refuses to run in production', () => {
  it('refuses NODE_ENV=production', () => {
    expect(() => assertSeedAllowed({ NODE_ENV: 'production' })).toThrow(
      /production/,
    );
    expect(() =>
      assertSeedAllowed({ NODE_ENV: 'production', ALLOW_DEMO_SEED: '0' }),
    ).toThrow(/production/);
    expect(() =>
      assertSeedAllowed({ NODE_ENV: 'production', ALLOW_DEMO_SEED: 'true' }),
    ).toThrow(/production/);
  });

  it('runs only with ALLOW_DEMO_SEED=1 in production, and freely elsewhere', () => {
    expect(() =>
      assertSeedAllowed({ NODE_ENV: 'production', ALLOW_DEMO_SEED: '1' }),
    ).not.toThrow();
    expect(() => assertSeedAllowed({ NODE_ENV: 'development' })).not.toThrow();
    expect(() => assertSeedAllowed({ NODE_ENV: 'test' })).not.toThrow();
    expect(() => assertSeedAllowed({})).not.toThrow();
  });
});

describe('the demo cabinet data', () => {
  it('has a complete doctor of Bordj Bou Arréridj', () => {
    expect(DEMO_DOCTOR.fullName).toBe('Dr Démonstration');
    expect(DEMO_DOCTOR.wilaya).toBe('Bordj Bou Arréridj');
    expect(DEMO_DOCTOR.speciality).toBeTruthy();
    expect(DEMO_DOCTOR.orderRegistrationNumber).toBeTruthy();
    expect(DEMO_DOCTOR.professionalAddress).toContain('Bordj Bou Arréridj');
    expect(DEMO_DOCTOR.email).toMatch(/@healix\.test$/);
  });

  it('has eight patients with French and Arabic names, and distinct ids', () => {
    expect(DEMO_PATIENTS).toHaveLength(8);
    expect(new Set(DEMO_PATIENTS.map((patient) => patient.id)).size).toBe(8);
    for (const patient of DEMO_PATIENTS) {
      expect(patient.firstName && patient.lastName).toBeTruthy();
      expect(patient.firstNameAr).toMatch(/[؀-ۿ]/);
      expect(patient.lastNameAr).toMatch(/[؀-ۿ]/);
      expect(patient.birthDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('has allergies, chronic diseases and treatments, including a penicillin allergy', () => {
    const summaries = DEMO_PATIENTS.map((patient) => patient.medicalSummary);
    expect(
      summaries.some((entry) => entry.allergies.includes('Pénicilline')),
    ).toBe(true);
    expect(
      summaries.filter((entry) => entry.allergies.length).length,
    ).toBeGreaterThanOrEqual(3);
    expect(
      summaries.filter((entry) => entry.chronicDiseases.length).length,
    ).toBeGreaterThanOrEqual(3);
    expect(
      summaries.filter((entry) => entry.currentMedications.length).length,
    ).toBeGreaterThanOrEqual(3);
  });

  it('gives the scenario patient an allergy that the safety check reports on an exact DCI match', () => {
    const amine = DEMO_PATIENTS.find(
      (patient) => patient.id === 'demo-patient-1',
    )!;
    const result = new PrescriptionSafetyService().evaluate(
      [
        {
          dci: 'Amoxicilline',
          strength: '1 g',
          pharmaceuticalForm: 'TABLET',
          regulatoryCategory: 'STANDARD',
          dosePerIntake: '1 comprimé',
          frequency: '2 fois par jour',
          durationDays: 6,
          quantity: '1 boîte',
        },
      ],
      amine.medicalSummary,
    );
    expect(result.alerts.some((alert) => alert.kind === 'ALLERGY')).toBe(true);
    expect(
      DEMO_MEDICATIONS.some((medication) => medication.dci === 'Amoxicilline'),
    ).toBe(true);
  });
});

describe('the appointments of the day', () => {
  const day = '2026-10-30';
  const appointments = demoAppointmentsFor(day);

  it('are five, on the given day, for patients of the cabinet', () => {
    expect(appointments).toHaveLength(5);
    const patients = new Set(DEMO_PATIENTS.map((patient) => patient.id));
    for (const appointment of appointments) {
      expect(appointment.id).toContain(day);
      expect(patients.has(appointment.patientId)).toBe(true);
    }
    expect(
      new Set(appointments.map((appointment) => appointment.id)).size,
    ).toBe(5);
  });

  it('follow the date of the day: other ids on another day, the same slots', () => {
    const next = demoAppointmentsFor('2026-11-02');
    expect(next.map((appointment) => appointment.time)).toEqual(
      appointments.map((appointment) => appointment.time),
    );
    expect(next[0].id).not.toBe(appointments[0].id);
  });

  it('has the scenario appointment at 10:00: Amine Benali, "Toux persistante", still to do', () => {
    const slot = appointments.find(
      (appointment) => appointment.time === '10:00',
    )!;
    expect(slot.patientId).toBe('demo-patient-1');
    expect(slot.reason).toBe('Toux persistante');
    expect(slot.status).toBe('CONFIRMED');
    expect(appointments[0].status).toBe('COMPLETED');
  });
});

describe('Algiers time', () => {
  it('reads the day of Algiers, not of UTC', () => {
    expect(algiersDay(new Date('2026-10-30T12:00:00.000Z'))).toBe('2026-10-30');
    expect(algiersDay(new Date('2026-10-30T23:30:00.000Z'))).toBe('2026-10-31');
  });

  it('places an instant at Algiers time (UTC+1), with an offset in days and a shift in minutes', () => {
    expect(algiersInstant('2026-10-30', '10:00').toISOString()).toBe(
      '2026-10-30T09:00:00.000Z',
    );
    expect(algiersInstant('2026-10-30', '10:00', -6).toISOString()).toBe(
      '2026-10-24T09:00:00.000Z',
    );
    expect(algiersInstant('2026-10-30', '10:00', 0, 90).toISOString()).toBe(
      '2026-10-30T10:30:00.000Z',
    );
  });
});

describe('the day of the cabinet', () => {
  it('is today in Algiers by default, or the day asked for', () => {
    const now = new Date('2026-10-30T23:30:00.000Z');
    expect(resolveSeedDay({}, now)).toBe('2026-10-31');
    expect(resolveSeedDay({ DEMO_SEED_DAY: '' }, now)).toBe('2026-10-31');
    expect(resolveSeedDay({ DEMO_SEED_DAY: '2026-11-05' }, now)).toBe(
      '2026-11-05',
    );
  });

  it('refuses anything that is not a real date', () => {
    for (const bad of [
      'demain',
      '2026-13-01',
      '2026-02-30',
      '30/10/2026',
      '2026-1-5',
    ]) {
      expect(() => resolveSeedDay({ DEMO_SEED_DAY: bad })).toThrow(
        /DEMO_SEED_DAY/,
      );
    }
  });
});

describe('the past consultations', () => {
  it('are three, complete, with vital signs the server accepts and one main diagnosis at most', () => {
    expect(DEMO_CONSULTATIONS).toHaveLength(3);
    const patients = new Set(DEMO_PATIENTS.map((patient) => patient.id));
    for (const consultation of DEMO_CONSULTATIONS) {
      expect(patients.has(consultation.patientId)).toBe(true);
      expect(
        consultation.chiefComplaint && consultation.assessment,
      ).toBeTruthy();
      expect(
        validateSync(
          plainToInstance(ConsultationVitalSignsDto, consultation.vitalSigns),
          { whitelist: true, forbidNonWhitelisted: true },
        ),
      ).toEqual([]);
      expect(
        consultation.diagnoses.filter((diagnosis) => diagnosis.isPrimary)
          .length,
      ).toBeLessThanOrEqual(1);
      expect(consultation.diagnoses.length).toBeGreaterThan(0);
    }
  });

  it('link today’s done appointment to its consultation, for the same patient', () => {
    const done = DEMO_CONSULTATIONS.find(
      (consultation) => consultation.appointmentSlot,
    )!;
    const slot = demoAppointmentsFor('2026-10-30')[done.appointmentSlot! - 1];
    expect(slot.patientId).toBe(done.patientId);
    expect(slot.status).toBe('COMPLETED');
  });
});

describe('the validated prescription', () => {
  it('has a number the server column holds, and items the safety check finds clean', () => {
    expect(DEMO_PRESCRIPTION.number.length).toBeLessThanOrEqual(20);
    const patient = DEMO_PATIENTS.find(
      (entry) => entry.id === DEMO_PRESCRIPTION.patientId,
    )!;
    const result = new PrescriptionSafetyService().evaluate(
      DEMO_PRESCRIPTION.items,
      patient.medicalSummary,
    );
    expect(result.alerts).toEqual([]);
  });

  it('is fingerprinted like the server does: canonical JSON, SHA-256, key order irrelevant', () => {
    expect(fingerprint({ b: 1, a: [{ d: 2, c: 3 }] })).toBe(
      fingerprint({ a: [{ c: 3, d: 2 }], b: 1 }),
    );
    expect(fingerprint({ a: 1 })).toMatch(/^[0-9a-f]{64}$/);
    expect(
      canonicalize({ b: new Date('2026-10-30T00:00:00.000Z'), a: 1 }),
    ).toEqual({ a: 1, b: '2026-10-30T00:00:00.000Z' });
    expect(fingerprint({ a: 1 })).not.toBe(fingerprint({ a: 2 }));
  });
});

// The analyses the doctor already decided, read offline by the Desktop.
describe('the decided AI analyses', () => {
  const byPipeline = (pipeline: DemoAiRun['pipeline']) =>
    DEMO_AI_RUNS.find((run) => run.pipeline === pipeline)!;

  // The row as GET /sync/ai-reports reads it.
  const asRun = (demo: DemoAiRun): AiReportRun => {
    const columns = demo.columns;
    return {
      id: demo.id,
      patientId: demo.patientId,
      pipeline: demo.pipeline,
      createdAt: new Date('2026-10-28T09:00:00.000Z'),
      decidedAt: new Date('2026-10-28T09:30:00.000Z'),
      decisionStatus: demo.decisionStatus,
      decisionLabel: demo.decisionLabel,
      decisionLabels: null,
      clinicianImpression: demo.clinicianImpression,
      modelDecision: columns.modelDecision ?? null,
      predictions: columns.predictions ?? null,
      malignancyScore: columns.malignancyScore ?? null,
      decisionThreshold: columns.decisionThreshold ?? null,
      magnification: columns.magnification ?? null,
      maskAreaRatio: columns.maskAreaRatio ?? null,
      volumetry: demo.pipeline === 'cardio-volume-mri' ? demoVolumetry() : null,
      classificationModelId: demo.classificationModelId,
      classificationWeightsSha256: columns.classificationWeightsSha256 ?? null,
      segmentationModelId: demo.segmentationModelId,
      segmentationWeightsSha256: columns.segmentationWeightsSha256 ?? null,
      decidedBy: { fullName: DEMO_DOCTOR.fullName },
      report: { reportNumber: demo.reportNumber, sha256: 'a'.repeat(64) },
    };
  };

  it('are three, for three patients of the cabinet, with ids that do not collide', () => {
    expect(DEMO_AI_RUNS).toHaveLength(3);
    const patients = new Set(DEMO_PATIENTS.map((patient) => patient.id));
    for (const run of DEMO_AI_RUNS) {
      expect(patients.has(run.patientId)).toBe(true);
    }
    for (const key of [
      'id',
      'documentId',
      'patientId',
      'reportNumber',
    ] as const) {
      expect(new Set(DEMO_AI_RUNS.map((run) => run[key])).size).toBe(3);
    }
    for (const run of DEMO_AI_RUNS) {
      expect(run.id).toMatch(/^demo-ai-run-\d+$/);
    }
  });

  it('are a validated brain MRI, a corrected breast pathology and a validated cardiac volumetry', () => {
    expect(DEMO_AI_RUNS.map((run) => run.pipeline).sort()).toEqual([
      'brain',
      'cardio-volume-mri',
      'pathology-breast',
    ]);
    expect(byPipeline('brain')).toMatchObject({
      decisionStatus: 'VALIDATED',
      decisionLabel: 'meningioma',
    });
    expect(byPipeline('cardio-volume-mri')).toMatchObject({
      decisionStatus: 'VALIDATED',
      decisionLabel: null,
    });
    const pathology = byPipeline('pathology-breast');
    expect(pathology.decisionStatus).toBe('CORRECTED');
    // A correction has its reason, and says something other than the model did.
    expect(pathology.decisionReason).toBeTruthy();
    expect(pathology.decisionLabel).toBe('benign');
    expect(pathology.columns.modelDecision).toBe('malignant');
    // The score is above the threshold: that is why the model said malignant.
    expect(pathology.columns.malignancyScore!).toBeGreaterThan(
      pathology.columns.decisionThreshold!,
    );
  });

  it('hold no image, mask or PDF: no path anywhere, and report numbers the sequence of the year ignores', () => {
    for (const run of DEMO_AI_RUNS) {
      expect(
        Object.keys(run.columns).filter((key) => key.endsWith('Path')),
      ).toEqual([]);
      expect(run.reportNumber.length).toBeLessThanOrEqual(20);
      // "CR-IA-<year>-NNNNNN" is what the real numbering counts from.
      expect(run.reportNumber).not.toMatch(/^CR-IA-\d{4}-/);
    }
  });

  it('were decided in the days before the presentation, inside the 7 days of the home page', () => {
    for (const run of DEMO_AI_RUNS) {
      expect(run.dayOffset).toBeLessThan(0);
      expect(run.dayOffset).toBeGreaterThanOrEqual(-6);
      expect(run.time).toMatch(/^\d{2}:\d{2}$/);
    }
  });

  it('give the volumetry an ejection fraction of 52 %, preserved, from the computation of the server', () => {
    const volumetry = readVolumetry(demoVolumetry());
    expect(volumetry).not.toBeNull();
    const measures = effectiveMeasures(volumetry!);
    expect(Math.round(measures.lv.efPercent!)).toBe(52);
    expect(lvefClass(measures.lv.efPercent)).toBe('preserved');
    expect(measures.indexed).not.toBeNull();
    expect(volumetry!.auto.edPhase).toBe(0);
    expect(volumetry!.auto.esPhase).toBe(5);
    expect(volumetry!.corrected).toBeNull();
    // Idempotent: the same data on every run.
    expect(demoVolumetry()).toEqual(demoVolumetry());
  });

  it('come out of the Desktop endpoint as the three results the demo shows', () => {
    const brain = toAiReportSyncPayload(asRun(byPipeline('brain')));
    expect(brain.moduleLabel).toBe('IRM cérébrale');
    expect(brain.modelDecision).toBe('meningioma');
    expect(brain.topPredictions).toHaveLength(3);
    expect(brain.measures).toEqual({ maskAreaRatio: 0.031 });
    expect(brain.classificationWeightsSha12).toHaveLength(12);
    expect(brain.segmentationWeightsSha12).toHaveLength(12);
    expect(brain.reportNumber).toBe('CR-IA-DEMO-000001');

    const pathology = toAiReportSyncPayload(
      asRun(byPipeline('pathology-breast')),
    );
    expect(pathology.decisionStatus).toBe('CORRECTED');
    expect(pathology.decisionLabel).toBe('benign');
    expect(pathology.modelDecision).toBe('malignant');
    expect(pathology.measures).toEqual({
      malignancyScore: 0.58,
      decisionThreshold: 0.5,
      magnification: 200,
    });

    const cardiac = toAiReportSyncPayload(
      asRun(byPipeline('cardio-volume-mri')),
    );
    expect(Math.round(cardiac.measures.lvef!)).toBe(52);
    expect(cardiac.measures.lvedvIndexed).not.toBeNull();
  });

  it('leave out of the Desktop endpoint everything it must not carry', () => {
    for (const run of DEMO_AI_RUNS) {
      const text = JSON.stringify(toAiReportSyncPayload(asRun(run)));
      if (run.decisionReason) expect(text).not.toContain(run.decisionReason);
      // A key ending in Path (not the word "Pathologie").
      expect(text).not.toMatch(/Path"s*:|ttaScores|nucleiFractions/);
    }
  });
});
