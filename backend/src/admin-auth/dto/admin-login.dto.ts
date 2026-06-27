import { IsEmail, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class AdminLoginDto {
  @IsEmail({}, { message: 'Email administrateur invalide.' })
  @IsNotEmpty({ message: "L'email administrateur est obligatoire." })
  @MaxLength(160, { message: 'Email administrateur invalide.' })
  email!: string;

  @IsString({ message: 'Le mot de passe est obligatoire.' })
  @IsNotEmpty({ message: 'Le mot de passe est obligatoire.' })
  @MinLength(8, {
    message: 'Le mot de passe doit contenir au moins 8 caracteres.',
  })
  @MaxLength(128, { message: 'Le mot de passe est invalide.' })
  password!: string;
}
