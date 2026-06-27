import { Transform } from 'class-transformer';
import { Equals, IsBoolean } from 'class-validator';

export class SubmitDoctorVerificationDto {
  @IsBoolean()
  @Equals(true, {
    message:
      'Vous devez confirmer que les informations fournies sont exactes.',
  })
  @Transform(({ value }) => value === true || value === 'true')
  confirmationAccuracy!: true;
}
