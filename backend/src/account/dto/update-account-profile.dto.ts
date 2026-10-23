import { Transform } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

import { EstablishmentType } from '../../common/enums/establishment-type.enum';
import { sanitizePhone, sanitizeTextInput } from '../../common/utils/sanitize';

// Every field is optional: only what is sent is changed. The identity fields
// (fullName, speciality, wilaya, establishmentName, establishmentType) are
// refused once the account is verified; which of them applies depends on the
// kind of account (see AccountService).
export class UpdateAccountProfileDto {
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
  @IsString({ message: "Le nom de l'établissement est obligatoire." })
  @IsNotEmpty({ message: "Le nom de l'établissement est obligatoire." })
  @MinLength(2, { message: "Le nom de l'établissement est obligatoire." })
  @MaxLength(150, { message: 'Maximum 150 caractères.' })
  establishmentName?: string;

  @IsOptional()
  @IsIn(Object.values(EstablishmentType), {
    message: "Le type d'établissement est invalide.",
  })
  establishmentType?: EstablishmentType;

  // Same format as at registration.
  @IsOptional()
  @Transform(({ value }) => sanitizePhone(value))
  @IsString({ message: 'Le téléphone est invalide.' })
  @Matches(/^\+?[0-9\s().-]{7,20}$/, {
    message: 'Le téléphone est invalide.',
  })
  @MaxLength(32, { message: 'Maximum 32 caractères.' })
  phone?: string;

  // The professional address of a doctor, the address of an establishment.
  @IsOptional()
  @Transform(({ value }) => sanitizeTextInput(value))
  @IsString({ message: "L'adresse est obligatoire." })
  @IsNotEmpty({ message: "L'adresse est obligatoire." })
  @MinLength(5, { message: "L'adresse est obligatoire." })
  @MaxLength(255, { message: 'Maximum 255 caractères.' })
  address?: string;
}
