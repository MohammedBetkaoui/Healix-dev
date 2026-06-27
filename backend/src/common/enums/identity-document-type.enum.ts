export const IdentityDocumentType = {
  DRIVING_LICENSE: 'DRIVING_LICENSE',
  NATIONAL_ID_CARD: 'NATIONAL_ID_CARD',
  OTHER: 'OTHER',
  PASSPORT: 'PASSPORT',
} as const;

export type IdentityDocumentType =
  (typeof IdentityDocumentType)[keyof typeof IdentityDocumentType];
