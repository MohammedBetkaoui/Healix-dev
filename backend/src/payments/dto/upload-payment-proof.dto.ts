import { IsEnum } from 'class-validator';

import { PaymentProofDocumentType } from '../../common/enums/payment-proof-document-type.enum';

export class UploadPaymentProofDto {
  @IsEnum(PaymentProofDocumentType)
  proofType!: PaymentProofDocumentType;
}
