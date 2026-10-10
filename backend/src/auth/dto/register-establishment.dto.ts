import { Transform } from 'class-transformer';
import {
  Equals,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

import { EstablishmentType } from '../../common/enums/establishment-type.enum';
import {
  normalizeEmail,
  sanitizePhone,
  sanitizeTextInput,
} from '../../common/utils/sanitize';
import { IsAccountPassword, IsPasswordConfirmation } from '../password-policy';

export class RegisterEstablishmentDto {
  @Transform(({ value }) => sanitizeTextInput(value))
  @IsString({ message: 'Ce champ est obligatoire' })
  @IsNotEmpty({ message: 'Ce champ est obligatoire' })
  @MinLength(2, { message: 'Ce champ est obligatoire' })
  @MaxLength(150, { message: 'Maximum 150 caractères' })
  establishmentName: string;

  @Transform(({ value }) => sanitizeTextInput(value))
  @IsEnum(EstablishmentType, { message: 'Type d’établissement invalide' })
  establishmentType: EstablishmentType;

  @Transform(({ value }) => sanitizeTextInput(value))
  @IsString({ message: 'Ce champ est obligatoire' })
  @IsNotEmpty({ message: 'Ce champ est obligatoire' })
  @MaxLength(80, { message: 'Maximum 80 caractères' })
  wilaya: string;

  @Transform(({ value }) => sanitizeTextInput(value))
  @IsString({ message: 'Ce champ est obligatoire' })
  @IsNotEmpty({ message: 'Ce champ est obligatoire' })
  @MinLength(5, { message: 'Ce champ est obligatoire' })
  @MaxLength(255, { message: 'Maximum 255 caractères' })
  address: string;

  @Transform(({ value }) => normalizeEmail(value))
  @IsString({ message: 'Ce champ est obligatoire' })
  @IsNotEmpty({ message: 'Ce champ est obligatoire' })
  @IsEmail({}, { message: 'Email invalide' })
  @MaxLength(191, { message: 'Maximum 191 caractères' })
  professionalEmail: string;

  @Transform(({ value }) => sanitizePhone(value))
  @IsString({ message: 'Téléphone obligatoire' })
  @IsNotEmpty({ message: 'Téléphone obligatoire' })
  @Matches(/^\+?[0-9\s().-]{7,20}$/, { message: 'Téléphone invalide' })
  @MaxLength(32, { message: 'Maximum 32 caractères' })
  phone: string;

  @Transform(({ value }) => sanitizeTextInput(value))
  @IsString({ message: 'Ce champ est obligatoire' })
  @IsNotEmpty({ message: 'Ce champ est obligatoire' })
  @MinLength(2, { message: 'Ce champ est obligatoire' })
  @MaxLength(120, { message: 'Maximum 120 caractères' })
  managerFullName: string;

  @IsAccountPassword({
    required: 'Ce champ est obligatoire',
    tooShort: 'Mot de passe trop court',
  })
  password: string;

  @IsPasswordConfirmation({
    mismatch: 'Les mots de passe ne correspondent pas',
    required: 'Ce champ est obligatoire',
  })
  confirmPassword: string;

  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean({ message: 'Veuillez accepter les conditions' })
  @Equals(true, { message: 'Veuillez accepter les conditions' })
  acceptTerms: boolean;

  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean({ message: 'Veuillez accepter les conditions' })
  @Equals(true, { message: 'Veuillez accepter les conditions' })
  acceptVerification: boolean;
}
