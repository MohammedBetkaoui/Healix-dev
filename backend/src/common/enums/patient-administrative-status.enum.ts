export const PatientAdministrativeStatus = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  DECEASED: 'DECEASED',
} as const;

export type PatientAdministrativeStatus =
  (typeof PatientAdministrativeStatus)[keyof typeof PatientAdministrativeStatus];
