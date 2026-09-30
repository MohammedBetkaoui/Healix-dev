import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { PatientAdministrativeStatus } from '../../../common/enums/patient-administrative-status.enum';
import { PatientBloodGroup } from '../../../common/enums/patient-blood-group.enum';
import { PatientGender } from '../../../common/enums/patient-gender.enum';
import { PatientInsurance } from '../../../common/enums/patient-insurance.enum';
import { PatientSector } from '../../../common/enums/patient-sector.enum';
import { PatientStatus } from '../../../common/enums/patient-status.enum';

// Same filters as ListPatientsQueryDto (backend/src/patients/dto), without
// the per-establishment/doctor scope: the admin lists every patient.
// ageGroup / lastVisit / registeredAt from PatientFilterState are left out:
// they have no backing column on the identity/demographics-only Patient model
// (and no appointment join), so they stay client-side filters on the loaded page.
export class ListAdminPatientsQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number = 10;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(120)
  @IsOptional()
  search?: string;

  @IsOptional()
  @IsEnum(PatientGender)
  gender?: keyof typeof PatientGender;

  @IsOptional()
  @IsEnum(PatientStatus)
  status?: keyof typeof PatientStatus;

  @IsOptional()
  @IsEnum(PatientAdministrativeStatus)
  administrativeStatus?: keyof typeof PatientAdministrativeStatus;

  @IsOptional()
  @IsEnum(PatientInsurance)
  insurance?: keyof typeof PatientInsurance;

  @IsOptional()
  @IsEnum(PatientSector)
  sector?: keyof typeof PatientSector;

  @IsOptional()
  @IsEnum(PatientBloodGroup)
  bloodGroup?: keyof typeof PatientBloodGroup;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  wilaya?: string;
}
