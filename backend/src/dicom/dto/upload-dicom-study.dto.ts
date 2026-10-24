import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class UploadDicomStudyDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(191)
  patientId!: string;
}
