export const FiscalActivityType = {
  GROUP_MEDICAL_CABINET: 'GROUP_MEDICAL_CABINET',
  INDIVIDUAL_MEDICAL_CABINET: 'INDIVIDUAL_MEDICAL_CABINET',
  MEDICAL_LIBERAL_PROFESSION: 'MEDICAL_LIBERAL_PROFESSION',
  OTHER: 'OTHER',
} as const;

export type FiscalActivityType =
  (typeof FiscalActivityType)[keyof typeof FiscalActivityType];
