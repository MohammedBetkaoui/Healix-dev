import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PrescriptionRegulatoryCategory,
  PrescriptionType,
} from '@prisma/client';

import { PrescriptionRegulatoryService } from './prescription-regulatory.service';

describe('PrescriptionRegulatoryService', () => {
  const config = {
    get: jest.fn().mockReturnValue(undefined),
  } as unknown as ConfigService;
  const service = new PrescriptionRegulatoryService(config);

  it('raises the prescription type to the highest item category', () => {
    expect(
      service.requiredType(PrescriptionType.STANDARD, [
        PrescriptionRegulatoryCategory.STANDARD,
        PrescriptionRegulatoryCategory.NARCOTIC,
      ]),
    ).toBe(PrescriptionType.NARCOTIC);
  });

  it('requires an acknowledgement for a special category', () => {
    expect(() =>
      service.finalize({
        requestedType: PrescriptionType.PSYCHOTROPIC,
        categories: [PrescriptionRegulatoryCategory.PSYCHOTROPIC],
        regulatoryData: {},
        prescriberRegistrationNumber: 'ORD-123',
      }),
    ).toThrow(BadRequestException);
  });

  it('does not invent official reimbursement or legal-duration assertions', () => {
    const snapshot = service.finalize({
      requestedType: PrescriptionType.REGULATED,
      categories: [PrescriptionRegulatoryCategory.REGULATED],
      regulatoryData: { acknowledgement: true },
      prescriberRegistrationNumber: 'ORD-123',
    });
    expect(snapshot).not.toHaveProperty('legalDurationDays');
    expect(snapshot.disclaimer).toContain('ne remplace pas');
  });
});
