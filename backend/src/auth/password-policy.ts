import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsString,
  MinLength,
  Validate,
  type ValidationArguments,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';

import { trimInput } from '../common/utils/sanitize';

// The password rules of every self-service form: registration and password
// reset. One definition, so the two can never drift apart.
export const PASSWORD_MIN_LENGTH = 8;

type PasswordMessages = {
  required: string;
  tooShort: string;
};

export function IsAccountPassword(messages: PasswordMessages) {
  return applyDecorators(
    Transform(({ value }) => trimInput(value)),
    IsString({ message: messages.required }),
    IsNotEmpty({ message: messages.required }),
    MinLength(PASSWORD_MIN_LENGTH, { message: messages.tooShort }),
  );
}

@ValidatorConstraint({ name: 'PasswordConfirmation', async: false })
class PasswordConfirmationConstraint implements ValidatorConstraintInterface {
  validate(confirmPassword: unknown, args: ValidationArguments): boolean {
    const { password } = args.object as { password?: unknown };
    return confirmPassword === password;
  }
}

// On the confirmation field, next to a `password` field of the same object.
export function IsPasswordConfirmation(messages: {
  mismatch: string;
  required: string;
}) {
  return applyDecorators(
    Transform(({ value }) => trimInput(value)),
    IsString({ message: messages.required }),
    IsNotEmpty({ message: messages.required }),
    Validate(PasswordConfirmationConstraint, { message: messages.mismatch }),
  );
}
