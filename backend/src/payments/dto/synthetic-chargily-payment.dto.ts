import { Transform } from 'class-transformer';
import {
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class SyntheticChargilyPaymentDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.replace(/\s+/g, '') : value,
  )
  @Matches(/^\d{16}$/)
  cardNumber!: string;

  @Matches(/^(0[1-9]|1[0-2])$/)
  expiryMonth!: string;

  @Matches(/^\d{4}$/)
  expiryYear!: string;

  @Length(3, 3)
  @Matches(/^\d{3}$/)
  psv!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(120)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value,
  )
  cardHolderName!: string;
}
