import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

import { sanitizeTextInput } from '../../common/utils/sanitize';

// Partial update of CreateAffiliatedDoctorDto's profile fields, with the same
// validators and sanitizers. No email/phone: they are unique login
// identifiers and are handled by a separate flow. Omitted fields stay
// unchanged; an explicit null sanitizes to '' and fails IsNotEmpty.
export class UpdateAffiliatedDoctorDto {
  @IsOptional()
  @Transform(({ value }) => sanitizeTextInput(value))
  @IsString({ message: 'Le nom complet est obligatoire.' })
  @IsNotEmpty({ message: 'Le nom complet est obligatoire.' })
  @MinLength(2, { message: 'Le nom complet est obligatoire.' })
  @MaxLength(120, { message: 'Maximum 120 caractères.' })
  fullName?: string;

  @IsOptional()
  @Transform(({ value }) => sanitizeTextInput(value))
  @IsString({ message: 'La spécialité est obligatoire.' })
  @IsNotEmpty({ message: 'La spécialité est obligatoire.' })
  @MinLength(2, { message: 'La spécialité est obligatoire.' })
  @MaxLength(100, { message: 'Maximum 100 caractères.' })
  speciality?: string;

  @IsOptional()
  @Transform(({ value }) => sanitizeTextInput(value))
  @IsString({ message: 'La wilaya est obligatoire.' })
  @IsNotEmpty({ message: 'La wilaya est obligatoire.' })
  @MaxLength(80, { message: 'Maximum 80 caractères.' })
  wilaya?: string;

  @IsOptional()
  @Transform(({ value }) => sanitizeTextInput(value))
  @IsString({ message: 'L’adresse professionnelle est obligatoire.' })
  @IsNotEmpty({ message: 'L’adresse professionnelle est obligatoire.' })
  @MinLength(5, { message: 'L’adresse professionnelle est obligatoire.' })
  @MaxLength(255, { message: 'Maximum 255 caractères.' })
  professionalAddress?: string;
}
