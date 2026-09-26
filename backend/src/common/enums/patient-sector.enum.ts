export const PatientSector = {
  PRIVATE: 'PRIVATE',
  PUBLIC: 'PUBLIC',
  CONVENTIONED: 'CONVENTIONED',
} as const;

export type PatientSector = (typeof PatientSector)[keyof typeof PatientSector];
