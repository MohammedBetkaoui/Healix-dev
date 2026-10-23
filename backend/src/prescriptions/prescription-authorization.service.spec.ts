import { UserRole } from '@prisma/client';

import { PrescriptionAuthorizationService } from './prescription-authorization.service';

describe('PrescriptionAuthorizationService capabilities', () => {
  const service = new PrescriptionAuthorizationService(
    {} as never,
    {} as never,
  );

  it('never grants clinical mutations to an establishment admin', () => {
    expect(service.capabilities(UserRole.ESTABLISHMENT_ADMIN)).toEqual({
      canViewPrescriptions: true,
      canCreatePrescription: false,
      canEditPrescription: false,
      canSignPrescription: false,
      canCancelPrescription: false,
      canPrintPrescription: true,
    });
  });

  it.each([UserRole.INDEPENDENT_DOCTOR, UserRole.AFFILIATED_DOCTOR])(
    'grants the clinical workflow to %s',
    (role) => {
      const capabilities = service.capabilities(role);
      expect(capabilities.canCreatePrescription).toBe(true);
      expect(capabilities.canSignPrescription).toBe(true);
      expect(capabilities.canCancelPrescription).toBe(true);
    },
  );
});
