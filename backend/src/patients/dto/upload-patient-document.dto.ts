import { IsEnum } from 'class-validator';

import { PatientDocumentType } from '../../common/enums/patient-document-type.enum';

export class UploadPatientDocumentDto {
  @IsEnum(PatientDocumentType)
  documentType!: keyof typeof PatientDocumentType;
}
