import 'reflect-metadata';

import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import {
  algiersDay,
  algiersInstant,
  assertSeedAllowed,
  canonicalize,
  DEMO_CONSULTATIONS,
  DEMO_DOCTOR,
  DEMO_MEDICATIONS,
  DEMO_PATIENTS,
  DEMO_PRESCRIPTION,
  demoAppointmentsFor,
  fingerprint,
  resolveSeedDay,
} from '../prisma/demo-cabinet-data';
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
