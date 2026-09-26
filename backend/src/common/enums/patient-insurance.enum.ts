export const PatientInsurance = {
  CNAS: 'CNAS',
  CASNOS: 'CASNOS',
  UNINSURED: 'UNINSURED',
  PRIVATE: 'PRIVATE',
} as const;

export type PatientInsurance =
  (typeof PatientInsurance)[keyof typeof PatientInsurance];
