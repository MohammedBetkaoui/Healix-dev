import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

// POST /messaging/conversations/:id/attachments/from-record
export class AttachmentFromRecordDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  patientDocumentId!: string;
}
