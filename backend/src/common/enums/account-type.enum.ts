export const AccountType = {
  ESTABLISHMENT: 'ESTABLISHMENT',
  INDEPENDENT_DOCTOR: 'INDEPENDENT_DOCTOR',
} as const;

export type AccountType = (typeof AccountType)[keyof typeof AccountType];
