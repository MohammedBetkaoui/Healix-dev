export const EstablishmentType = {
  CLINIC: 'CLINIC',
  HOSPITAL: 'HOSPITAL',
  IMAGING_CENTER: 'IMAGING_CENTER',
  LABORATORY: 'LABORATORY',
  GROUP_PRACTICE: 'GROUP_PRACTICE',
} as const;

export type EstablishmentType =
  (typeof EstablishmentType)[keyof typeof EstablishmentType];
