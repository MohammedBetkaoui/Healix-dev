import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { SyncEntityType, SyncOperationKind } from '@prisma/client';

import {
  ConsultationDiagnosisDto,
  ConsultationVitalSignsDto,
} from '../../consultations/dto/update-consultation.dto';

// Only the consultation aggregate is writable offline in V1. PATIENT and
// APPOINTMENT flow cloud -> desktop; pushing them to the cloud is refused
// here, at the validation pipe, before any service code runs.
export const SYNC_PUSH_ENTITY_TYPES = ['CONSULTATION'] as const;

export class SyncConsultationPayloadDto {
  @IsString()
  patientId!: string;

  @IsOptional()
  @IsString()
  serverEntityId?: string;

  @IsOptional()
  @IsString()
  appointmentId?: string | null;

  @IsIn(['LOCAL_DRAFT', 'IN_PROGRESS', 'READY_TO_SYNC'])
  localStatus!: 'LOCAL_DRAFT' | 'IN_PROGRESS' | 'READY_TO_SYNC';

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  chiefComplaint?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  historyPresentIllness?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  clinicalExamination?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  assessment?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  carePlan?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  followUpPlan?: string | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => ConsultationVitalSignsDto)
  vitalSigns?: ConsultationVitalSignsDto | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => ConsultationDiagnosisDto)
  diagnoses?: ConsultationDiagnosisDto[];
}

export class SyncOperationDto {
  @IsUUID('4')
  operationId!: string;

  @IsIn(SYNC_PUSH_ENTITY_TYPES, {
    message:
      'entityType: seule CONSULTATION est synchronisée vers le cloud; PATIENT et APPOINTMENT sont en lecture seule hors ligne.',
  })
  entityType!: SyncEntityType;

  @IsUUID('4')
  localEntityId!: string;

  @IsEnum(SyncOperationKind)
  operation!: SyncOperationKind;

  @IsOptional()
  @IsInt()
  @Min(1)
  baseVersion?: number;

  @IsDateString()
  occurredAt!: string;

  @ValidateNested()
  @Type(() => SyncConsultationPayloadDto)
  payload!: SyncConsultationPayloadDto;
}

export class SyncPushDto {
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => SyncOperationDto)
  operations!: SyncOperationDto[];
}

export class SyncPullQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(512)
  cursor?: string;
}

export class SyncAckDto {
  @IsString()
  @MaxLength(512)
  cursor!: string;
}
