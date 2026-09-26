import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

import { PatientConsentStatus } from '../../common/enums/patient-consent-status.enum';

export class UpsertPatientConsentDto {
  @IsEnum(PatientConsentStatus)
  status!: keyof typeof PatientConsentStatus;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  documentName?: string;
}
