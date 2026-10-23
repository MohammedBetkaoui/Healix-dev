import { PrescriptionStatus } from '@prisma/client';

import {
  effectivePrescriptionStatus,
  type PrescriptionDetail,
  toPrescriptionResponse,
} from './prescription-response.mapper';

describe('effectivePrescriptionStatus', () => {
  it('calculates EXPIRED without changing the stored clinical status', () => {
    expect(
      effectivePrescriptionStatus({
        status: PrescriptionStatus.VALIDATED,
        validUntil: new Date(Date.now() - 1000),
      }),
    ).toBe('EXPIRED');
  });

  it('does not treat a canceled prescription as expired', () => {
    expect(
      effectivePrescriptionStatus({
        status: PrescriptionStatus.CANCELED,
        validUntil: new Date(Date.now() - 1000),
      }),
    ).toBe(PrescriptionStatus.CANCELED);
  });
});

describe('toPrescriptionResponse insurance', () => {
  const base = {
    status: PrescriptionStatus.VALIDATED,
    validUntil: null,
    patientSnapshot: null,
    prescriberSnapshot: null,
    safetySnapshot: null,
    regulatorySnapshot: null,
    regulatoryData: null,
    insuranceSnapshot: {
      organization: 'CNAS',
      insuredNumber: '123456789012',
      sector: 'PUBLIC',
    },
    patient: { id: 'p1' },
    prescriber: { id: 'd1', user: {} },
    encounter: null,
    items: [],
    basedOnPrescription: null,
    document: null,
  } as unknown as PrescriptionDetail;

  it('never returns the full insured number of a frozen prescription', () => {
    const response = toPrescriptionResponse(base);
    expect(response.insurance).toEqual({
      organization: 'CNAS',
      maskedInsuredNumber: '********9012',
    });
    expect(JSON.stringify(response)).not.toContain('123456789012');
  });

  it('tolerates a frozen prescription without insurance snapshot', () => {
    const response = toPrescriptionResponse({
      ...base,
      insuranceSnapshot: null,
    });
    expect(response.insurance).toEqual({
      organization: null,
      maskedInsuredNumber: null,
    });
  });
});
