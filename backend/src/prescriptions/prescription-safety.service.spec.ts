import { PrescriptionRegulatoryCategory } from '@prisma/client';

import { PrescriptionSafetyService } from './prescription-safety.service';

const item = (overrides: Record<string, unknown> = {}) => ({
  dci: 'Paracétamol',
  strength: '500 mg',
  pharmaceuticalForm: 'TABLET',
  route: 'ORAL',
  regulatoryCategory: PrescriptionRegulatoryCategory.STANDARD,
  dosePerIntake: '1 comprimé',
  frequency: '2 fois par jour',
  durationDays: 5,
  quantity: '10 comprimés',
  ...overrides,
});

describe('PrescriptionSafetyService', () => {
  const service = new PrescriptionSafetyService();

  it('detects exact duplicate medication snapshots', () => {
    const result = service.evaluate([item(), item()], { allergies: [] });
    expect(result.alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'DUPLICATION' }),
      ]),
    );
  });

  it('only reports a structured allergy on an exact normalized DCI match', () => {
    const exact = service.evaluate([item()], { allergies: ['paracetamol'] });
    const broad = service.evaluate([item()], { allergies: ['antalgiques'] });
    expect(exact.alerts.some((alert) => alert.kind === 'ALLERGY')).toBe(true);
    expect(broad.alerts.some((alert) => alert.kind === 'ALLERGY')).toBe(false);
  });

  it('declares unsupported clinical checks as not evaluated', () => {
    const result = service.evaluate([item()], null);
    expect(result.notEvaluated).toContain('DRUG_INTERACTIONS');
    expect(result.notEvaluated).toContain('RENAL_FUNCTION');
    expect(result.alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'MISSING_CONTEXT' }),
      ]),
    );
  });
});
