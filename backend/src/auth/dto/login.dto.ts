import { IsEmail, IsIn, IsNotEmpty, IsString } from 'class-validator';

import { IsAccountPassword } from '../password-policy';

export const loginAccountTypes = [
  'ESTABLISHMENT',
  'INDEPENDENT_DOCTOR',
] as const;

export type LoginAccountType = (typeof loginAccountTypes)[number];

export class LoginDto {
  @IsString()
  @IsIn(loginAccountTypes, {
    message: 'Le type de compte est invalide.',
  })
  accountType!: LoginAccountType;

  @IsString()
  @IsNotEmpty({ message: "L'email est obligatoire." })
  @IsEmail({}, { message: 'Email invalide.' })
  email!: string;

  // Trimmed and checked like at registration and reset: a password saved
  // there is matched here the same way.
  @IsAccountPassword({
    required: 'Le mot de passe est obligatoire.',
    tooShort: 'Le mot de passe doit contenir au moins 8 caracteres.',
  })
  password!: string;
}
