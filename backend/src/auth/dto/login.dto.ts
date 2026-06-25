import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsString,
  MinLength,
} from 'class-validator';

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

  @IsString()
  @IsNotEmpty({ message: 'Le mot de passe est obligatoire.' })
  @MinLength(8, {
    message: 'Le mot de passe doit contenir au moins 8 caracteres.',
  })
  password!: string;
}
