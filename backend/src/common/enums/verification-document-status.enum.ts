export const VerificationDocumentStatus = {
  READY: 'READY',
  REJECTED: 'REJECTED',
  UPLOADED: 'UPLOADED',
} as const;

export type VerificationDocumentStatus =
  (typeof VerificationDocumentStatus)[keyof typeof VerificationDocumentStatus];
