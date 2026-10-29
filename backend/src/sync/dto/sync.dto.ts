import { Type, plainToInstance } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
  validateSync,
} from 'class-validator';
import type { ClassConstructor } from 'class-transformer';
import {
  AdministrationRoute,
  PharmaceuticalForm,
  PrescriptionRegulatoryCategory,
  PrescriptionType,
  SyncEntityType,
  SyncOperationKind,
} from '@prisma/client';

import { RegulatoryDetailsDto } from '../../prescriptions/dto/regulatory-details.dto';
import {
  ConsultationDiagnosisDto,
  ConsultationVitalSignsDto,
} from '../../consultations/dto/update-consultation.dto';

// Draft aggregates writable offline. PATIENT and APPOINTMENT flow
// cloud -> desktop; pushing them to the cloud is refused here, at the
// validation layer, before any service code runs. PRESCRIPTION pushes are
// accepted only while the server-side row is a DRAFT (validated/canceled
// orders are terminal, read-only states).
export const SYNC_PUSH_ENTITY_TYPES = ['CONSULTATION', 'PRESCRIPTION'] as const;

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

// Field-for-field the CreatePrescriptionItemDto: nothing beyond the doctor's
// draft input is trusted from the device. medicationId is re-validated from
// the authoritative MedicationReference catalog server-side (the desktop
// cache is an UX helper, never a regulatory source).
export class SyncPrescriptionItemDto {
  @IsOptional()
  @IsString()
  @MaxLength(191)
  medicationId?: string | null;

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  dci!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  brandName?: string | null;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  strength!: string;

  @IsEnum(PharmaceuticalForm)
  pharmaceuticalForm!: PharmaceuticalForm;

  @IsEnum(AdministrationRoute)
  route!: AdministrationRoute;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  manufacturer?: string | null;

  @IsEnum(PrescriptionRegulatoryCategory)
  regulatoryCategory!: PrescriptionRegulatoryCategory;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  dosePerIntake!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  frequency!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  intakeMoment?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3650)
  durationDays?: number | null;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  quantity!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  patientInstructions?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  indication?: string | null;

  @IsOptional()
  @IsBoolean()
  asNeeded?: boolean;

  @IsOptional()
  @IsBoolean()
  renewalAllowed?: boolean;

  @IsOptional()
  @IsBoolean()
  substitutionAllowed?: boolean;
}

// Draft fields only. The server always derives workspaceId,
// prescriberDoctorProfileId and createdById from the offline actor, and
// recalculates the effective regulatory type from the prepared items — no
// tenant or prescriber identifier is ever taken from the payload. prescribedAt
// stays server-owned (it is the moment the draft enters the clinical record).
export class SyncPrescriptionPayloadDto {
  @IsString()
  patientId!: string;

  @IsOptional()
  @IsString()
  serverEntityId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  encounterId?: string | null;

  @IsOptional()
  @IsEnum(PrescriptionType)
  type?: PrescriptionType;

  @IsOptional()
  @IsISO8601()
  validUntil?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => SyncPrescriptionItemDto)
  items?: SyncPrescriptionItemDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => RegulatoryDetailsDto)
  regulatory?: RegulatoryDetailsDto | null;
}

export type SyncOperationPayloadDto =
  | SyncConsultationPayloadDto
  | SyncPrescriptionPayloadDto;

export class SyncOperationDto {
  @IsUUID('4')
  operationId!: string;

  @IsIn(SYNC_PUSH_ENTITY_TYPES, {
    message:
      'entityType: seules une consultation ou un brouillon d\'ordonnance (PRESCRIPTION DRAFT) sont synchronisés vers le cloud; PATIENT et APPOINTMENT sont en lecture seule hors ligne.',
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

  // Polymorphic: validated per entityType, in the service, once the durable
  // SyncOperation row exists (a malformed payload is therefore REJECTED
  // durably instead of failing the whole batch).
  @IsObject()
  payload!: unknown;
}

export type ParsedSyncOperationPayload =
  | {
      ok: true;
      entityType: Extract<SyncEntityType, 'CONSULTATION'>;
      payload: SyncConsultationPayloadDto;
    }
  | {
      ok: true;
      entityType: Extract<SyncEntityType, 'PRESCRIPTION'>;
      payload: SyncPrescriptionPayloadDto;
    }
  | { ok: false; message: string };

export function parseSyncOperationPayload(
  operation: SyncOperationDto,
): ParsedSyncOperationPayload {
  if (operation.entityType === SyncEntityType.PRESCRIPTION) {
    const parsed = parsePayloadDto(SyncPrescriptionPayloadDto, operation.payload);
    return parsed.ok
      ? {
          ok: true,
          entityType: SyncEntityType.PRESCRIPTION,
          payload: parsed.payload,
        }
      : parsed;
  }
  const parsed = parsePayloadDto(SyncConsultationPayloadDto, operation.payload);
  return parsed.ok
    ? {
        ok: true,
        entityType: SyncEntityType.CONSULTATION,
        payload: parsed.payload,
      }
    : parsed;
}

function parsePayloadDto<T extends object>(
  dto: ClassConstructor<T>,
  raw: unknown,
): { ok: true; payload: T } | { ok: false; message: string } {
  const instance = plainToInstance(dto, raw);
  const errors = validateSync(instance, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  if (errors.length) {
    const message =
      errors
        .flatMap((error) => Object.values(error.constraints ?? {}))
        .join(' ') || 'Payload de synchronisation invalide.';
    return { ok: false, message };
  }
  return { ok: true, payload: instance };
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
