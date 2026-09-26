export const PatientGender = {
  MALE: 'MALE',
  FEMALE: 'FEMALE',
} as const;

export type PatientGender = (typeof PatientGender)[keyof typeof PatientGender];
