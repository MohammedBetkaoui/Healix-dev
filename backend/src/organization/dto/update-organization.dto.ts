import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsNumber,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

import { normalizeEmail, sanitizePhone, sanitizeTextInput } from '../../common/utils/sanitize';

// Operationally editable fields of an organization: professional contacts,
// default appointment duration and the DPO contact. Nothing legal is here on
// purpose: the legal identity never changes through this endpoint (it is read
// from the verification data and becomes read-only once VERIFIED).
//
// Only the fields sent (present in the JSON body) are changed. Conseil:
// - phone / professionalEmail / defaultAppointmentDuration cannot be emptied:
//   they are required business data, an explicit null is refused.
// - website and the DPO fields accept an explicit null to be cleared; an empty
//   string is refused so "I want to clear it" cannot mean "keep it".

// Skip only when the field is absent: a null then fails its validators.
const IsSentField = (fieldName: string) =>
  ValidateIf((dto: Record<string, unknown>) => dto[fieldName] !== undefined);

// Skip when absent or explicitly null (clearing); validate real values.
const IsClearableField = (fieldName: string) =>
  ValidateIf((dto: Record<string, unknown>) => {
    const value = dto[fieldName];
    return value !== undefined && value !== null;
  });

export class UpdateOrganizationDto {
  @IsSentField('phone')
  @Transform(({ value }) => sanitizePhone(value))
  @IsString({ message: 'Le téléphone professionnel est invalide.' })
  @Matches(/^\+?[0-9\s().-]{7,20}$/, {
    message: 'Le téléphone professionnel est invalide.',
  })
  @MaxLength(32, { message: 'Maximum 32 caractères.' })
  phone?: string;

  @IsSentField('professionalEmail')
  @Transform(({ value }) => normalizeEmail(value))
  @IsEmail({}, { message: "L'e-mail professionnel est invalide." })
  @MaxLength(191, { message: 'Maximum 191 caractères.' })
  professionalEmail?: string;

  @IsClearableField('website')
  @Transform(({ value }) => sanitizeTextInput(value))
  @IsString({ message: 'Le site web est invalide.' })
  @Matches(/^https?:\/\/\S+$/i, { message: 'Le site web est invalide.' })
  @MaxLength(191, { message: 'Maximum 191 caractères.' })
  website?: string | null;

  // Default duration proposed when creating an appointment; existing
  // appointments are never recalculated.
  @IsSentField('defaultAppointmentDuration')
  @Transform(({ value }) => (typeof value === 'string' ? Number(value) : value))
  @IsNumber(
    { maxDecimalPlaces: 0 },
    { message: 'La durée est invalide.' },
  )
  @IsIn([10, 15, 20, 30, 45, 60], {
    message: 'La durée doit être 10, 15, 20, 30, 45 ou 60 minutes.',
  })
  defaultAppointmentDuration?: number;

  @IsClearableField('dataProtectionOfficerName')
  @Transform(({ value }) => sanitizeTextInput(value))
  @IsString({ message: 'Le nom du délégué est invalide.' })
  @MinLength(2, { message: 'Le nom du délégué est trop court.' })
  @MaxLength(120, { message: 'Maximum 120 caractères.' })
  dataProtectionOfficerName?: string | null;

  @IsClearableField('dataProtectionOfficerEmail')
  @Transform(({ value }) => normalizeEmail(value))
  @IsEmail({}, { message: "L'e-mail du délégué est invalide." })
  @MaxLength(191, { message: 'Maximum 191 caractères.' })
  dataProtectionOfficerEmail?: string | null;

  @IsClearableField('dataProtectionOfficerPhone')
  @Transform(({ value }) => sanitizePhone(value))
  @IsString({ message: 'Le téléphone du délégué est invalide.' })
  @Matches(/^\+?[0-9\s().-]{7,20}$/, {
    message: 'Le téléphone du délégué est invalide.',
  })
  @MaxLength(32, { message: 'Maximum 32 caractères.' })
  dataProtectionOfficerPhone?: string | null;
}

const FIELDS = [
  'phone',
  'professionalEmail',
  'website',
  'defaultAppointmentDuration',
  'dataProtectionOfficerName',
  'dataProtectionOfficerEmail',
  'dataProtectionOfficerPhone',
] as const;

// What the audit log stores when an update happens: the field names only,
// never the values (personal data of the manager and of the DPO).
export function updatedOrganizationFields(dto: UpdateOrganizationDto): string[] {
  return FIELDS.filter((field) => dto[field] !== undefined);
}
