import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

import { sanitizePhone, sanitizeTextInput } from '../../common/utils/sanitize';
import {
  IsAccountPassword,
  IsPasswordConfirmation,
} from '../../auth/password-policy';

// What the invitee sends back on the public acceptance page. The e-mail is
// never here: it is the one the invitation was sent to. The tabular password
// confirmation matches the registration and reset forms.
// the professional fields of a doctor are optional: an incomplete profile
// stays DRAFT and is completed through the professional verification.
export class AcceptTeamInvitationDto {
  // Any value is accepted here: a missing or malformed token gets the same
  // INVITATION_INVALID answer as an unknown one, from the service.
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : ''))
  @IsString()
  token!: string;

  @Transform(({ value }) => sanitizeTextInput(value))
  @IsString({ message: 'Le nom complet est obligatoire.' })
  @MinLength(2, { message: 'Le nom complet est obligatoire.' })
  @MaxLength(120, { message: 'Maximum 120 caractères.' })
  fullName!: string;

  @Transform(({ value }) => sanitizePhone(value))
  @IsString({ message: 'Le téléphone est obligatoire.' })
  @Matches(/^\+?[0-9\s().-]{7,20}$/, {
    message: 'Le téléphone est obligatoire.',
  })
  @MaxLength(32, { message: 'Maximum 32 caractères.' })
  phone!: string;

  @IsAccountPassword({
    required: 'Le mot de passe doit contenir au moins 8 caractères.',
    tooShort: 'Le mot de passe doit contenir au moins 8 caractères.',
  })
  password!: string;

  @IsPasswordConfirmation({
    mismatch: 'Les mots de passe ne correspondent pas.',
    required: 'Les mots de passe ne correspondent pas.',
  })
  confirmPassword!: string;

  // The doctor's professional data, optional at acceptance (the profile then
  // stays DRAFT and the verification completes it). Accepted only for a
  // DOCTOR invitation: the service ignores them for an admin.
  @IsOptional()
  @Transform(({ value }) => sanitizeTextInput(value))
  @IsString({ message: 'La spécialité est invalide.' })
  @MaxLength(100, { message: 'Maximum 100 caractères.' })
  speciality?: string;

  @IsOptional()
  @Transform(({ value }) => sanitizeTextInput(value))
  @IsString({ message: 'La wilaya est invalide.' })
  @MaxLength(80, { message: 'Maximum 80 caractères.' })
  wilaya?: string;

  @IsOptional()
  @Transform(({ value }) => sanitizeTextInput(value))
  @IsString({ message: 'L’adresse professionnelle est invalide.' })
  @MaxLength(255, { message: 'Maximum 255 caractères.' })
  professionalAddress?: string;
}
