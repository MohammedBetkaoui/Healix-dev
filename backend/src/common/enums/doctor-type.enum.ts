export const DoctorType = {
  GENERAL_PRACTITIONER: 'GENERAL_PRACTITIONER',
  SPECIALIST: 'SPECIALIST',
} as const;

export type DoctorType = (typeof DoctorType)[keyof typeof DoctorType];
