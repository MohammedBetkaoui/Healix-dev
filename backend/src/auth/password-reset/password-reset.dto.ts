import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength } from 'class-validator';

import { normalizeEmail } from '../../common/utils/sanitize';
import { IsAccountPassword, IsPasswordConfirmation } from '../password-policy';

export class ForgotPasswordDto {
  @Transform(({ value }) => normalizeEmail(value))
  @IsString({ message: 'Email invalide.' })
  @IsEmail({}, { message: 'Email invalide.' })
  @MaxLength(191, { message: 'Maximum 191 caractères.' })
  email: string;
}

export class ResetPasswordDto {
  // Any value is accepted here: a missing or malformed token gets the same
  // RESET_TOKEN_INVALID answer as an unknown one, from the service.
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : ''))
  @IsString()
  token: string;

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
}
