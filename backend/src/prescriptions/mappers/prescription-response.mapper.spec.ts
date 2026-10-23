import { PrescriptionStatus } from '@prisma/client';

import { effectivePrescriptionStatus } from './prescription-response.mapper';

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
