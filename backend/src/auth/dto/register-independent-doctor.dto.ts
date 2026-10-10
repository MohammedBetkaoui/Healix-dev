import { Transform } from 'class-transformer';
import {
  Equals,
  IsBoolean,
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
import { IsAccountPassword, IsPasswordConfirmation } from '../password-policy';

export class RegisterIndependentDoctorDto {
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

  @IsAccountPassword({
    required: 'Le mot de passe doit contenir au moins 8 caractères.',
    tooShort: 'Le mot de passe doit contenir au moins 8 caractères.',
  })
  password: string;

  @IsPasswordConfirmation({
    mismatch: 'Les mots de passe ne correspondent pas.',
    required: 'Les mots de passe ne correspondent pas.',
  })
  confirmPassword: string;

  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean({
    message: 'Vous devez accepter les conditions d’utilisation.',
  })
  @Equals(true, {
    message: 'Vous devez accepter les conditions d’utilisation.',
  })
  acceptTerms: boolean;

  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean({
    message: 'Vous devez accepter la vérification professionnelle.',
  })
  @Equals(true, {
    message: 'Vous devez accepter la vérification professionnelle.',
  })
  acceptVerification: boolean;
}
