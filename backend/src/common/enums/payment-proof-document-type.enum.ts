export const PaymentProofDocumentType = {
  POST_TRANSFER_PROOF: 'POST_TRANSFER_PROOF',
  BARIDIMOB_RECEIPT: 'BARIDIMOB_RECEIPT',
} as const;

export type PaymentProofDocumentType =
  (typeof PaymentProofDocumentType)[keyof typeof PaymentProofDocumentType];
