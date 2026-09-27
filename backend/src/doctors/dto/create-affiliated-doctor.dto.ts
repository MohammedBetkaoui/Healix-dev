import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

import {
  normalizeEmail,
  sanitizePhone,
  sanitizeTextInput,
} from '../../common/utils/sanitize';

// Mirrors the identity/contact validation rules of
// RegisterIndependentDoctorDto exactly. No password/confirmPassword/
// acceptTerms/acceptVerification here: the password is generated server-side
// and there is no self-registration flow to gate with consent checkboxes.
export class CreateAffiliatedDoctorDto {
  @Transform(({ value }) => sanitizeTextInput(value))
  @IsString({ message: 'Le nom complet est obligatoire.' })
  @IsNotEmpty({ message: 'Le nom complet est obligatoire.' })
  @MinLength(2, { message: 'Le nom complet est obligatoire.' })
  @MaxLength(120, { message: 'Maximum 120 caractères.' })
  fullName: string;

  @Transform(({ value }) => sanitizeTextInput(value))
  @IsString({ message: 'La spécialité est obligatoire.' })
  @IsNotEmpty({ message: 'La spécialité est obligatoire.' })
  @MinLength(2, { message: 'La spécialité est obligatoire.' })
  @MaxLength(100, { message: 'Maximum 100 caractères.' })
  speciality: string;

  @Transform(({ value }) => sanitizeTextInput(value))
  @IsString({ message: 'La wilaya est obligatoire.' })
  @IsNotEmpty({ message: 'La wilaya est obligatoire.' })
  @MaxLength(80, { message: 'Maximum 80 caractères.' })
  wilaya: string;

  @Transform(({ value }) => sanitizeTextInput(value))
  @IsString({ message: 'L’adresse professionnelle est obligatoire.' })
  @IsNotEmpty({ message: 'L’adresse professionnelle est obligatoire.' })
  @MinLength(5, { message: 'L’adresse professionnelle est obligatoire.' })
  @MaxLength(255, { message: 'Maximum 255 caractères.' })
  professionalAddress: string;

  @Transform(({ value }) => normalizeEmail(value))
  @IsString({ message: 'Email invalide.' })
  @IsNotEmpty({ message: 'Email invalide.' })
  @IsEmail({}, { message: 'Email invalide.' })
  @MaxLength(191, { message: 'Maximum 191 caractères.' })
  email: string;

  @Transform(({ value }) => sanitizePhone(value))
  @IsString({ message: 'Le téléphone est obligatoire.' })
  @IsNotEmpty({ message: 'Le téléphone est obligatoire.' })
  @Matches(/^\+?[0-9\s().-]{7,20}$/, {
    message: 'Le téléphone est obligatoire.',
  })
  @MaxLength(32, { message: 'Maximum 32 caractères.' })
  phone: string;
}
