import { PrescriptionType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

import { CreatePrescriptionItemDto } from './create-prescription-item.dto';
import { RegulatoryDetailsDto } from './regulatory-details.dto';

export class CreatePrescriptionDto {
  @IsString()
  @MaxLength(191)
  patientId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  encounterId?: string;

  @IsOptional()
  @IsEnum(PrescriptionType)
  type?: PrescriptionType;

  @IsOptional()
  @IsISO8601()
  validUntil?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CreatePrescriptionItemDto)
  items!: CreatePrescriptionItemDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => RegulatoryDetailsDto)
  regulatory?: RegulatoryDetailsDto;
}
