export const CabinetType = {
  GROUP_CABINET: 'GROUP_CABINET',
  INDIVIDUAL_CABINET: 'INDIVIDUAL_CABINET',
  OTHER: 'OTHER',
  PRIVATE_CONSULTATION: 'PRIVATE_CONSULTATION',
  TELECONSULTATION: 'TELECONSULTATION',
} as const;

export type CabinetType = (typeof CabinetType)[keyof typeof CabinetType];
