import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

import { trimInput } from '../../common/utils/sanitize';
import { IsAccountPassword } from '../../auth/password-policy';

export class ChangePasswordDto {
  // Only checked against the stored hash: a wrong one, whatever its length,
  // gets the same answer.
  @Transform(({ value }) => trimInput(value))
  @IsString({ message: 'Le mot de passe actuel est obligatoire.' })
  @IsNotEmpty({ message: 'Le mot de passe actuel est obligatoire.' })
  @MaxLength(256, { message: 'Le mot de passe actuel est trop long.' })
  currentPassword: string;

  // The rule of the registration and of the reset: one definition.
  @IsAccountPassword({
    required: 'Le mot de passe doit contenir au moins 8 caractères.',
    tooShort: 'Le mot de passe doit contenir au moins 8 caractères.',
  })
  newPassword: string;
}
