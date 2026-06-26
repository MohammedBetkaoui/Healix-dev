import { IsEnum } from 'class-validator';

import { VerificationDocumentType } from '../../../common/enums/verification-document-type.enum';

export class UploadEstablishmentDocumentDto {
  @IsEnum(VerificationDocumentType)
  documentType!: keyof typeof VerificationDocumentType;
}
