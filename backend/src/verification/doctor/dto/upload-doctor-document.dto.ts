import { IsEnum } from 'class-validator';

import { VerificationDocumentType } from '../../../common/enums/verification-document-type.enum';

export class UploadDoctorDocumentDto {
  @IsEnum(VerificationDocumentType)
  documentType!: keyof typeof VerificationDocumentType;
}
