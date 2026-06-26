import { Transform } from 'class-transformer';
import { IsBoolean, Equals } from 'class-validator';

export class SubmitEstablishmentVerificationDto {
  @IsBoolean()
  @Equals(true, {
    message:
      'Vous devez confirmer que les informations fournies sont exactes.',
  })
  @Transform(({ value }) => value === true || value === 'true')
  confirmationAccuracy!: true;
}
