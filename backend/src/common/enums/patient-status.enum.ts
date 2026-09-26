export const PatientStatus = {
  ACTIVE: 'ACTIVE',
  FOLLOW_UP: 'FOLLOW_UP',
  NEW: 'NEW',
  URGENT: 'URGENT',
} as const;

export type PatientStatus = (typeof PatientStatus)[keyof typeof PatientStatus];
