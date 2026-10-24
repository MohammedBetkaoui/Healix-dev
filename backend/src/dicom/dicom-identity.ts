// Does the DICOM header describe the patient of the record? Name, birth date
// and sex are compared; a difference is a warning for the physician, never a
// refusal (a header is often typed by hand, spelled differently, or
// anonymised). A value the header does not carry is not compared.
export type IdentityField = 'PatientBirthDate' | 'PatientName' | 'PatientSex';

export type IdentityWarning = {
  /** The value found in the DICOM header. */
  dicomValue: string;
  field: IdentityField;
};

export type DicomPatientTags = {
  patientBirthDate: string | null;
  patientName: string | null;
  patientSex: string | null;
};

export type RecordPatient = {
  birthDate: Date;
  firstName: string;
  firstNameAr: string;
  gender: string;
  lastName: string;
  lastNameAr: string;
};

// Lower case, without accents, split on anything that is not a letter or a
// digit: "BENALI^Amine" and "Amine Benali" give the same two words.
export function nameTokens(value: string): string[] {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

// Every word of the patient's first and last name is in the DICOM name,
// whatever the order, in the Latin or in the Arabic spelling of the record.
function nameMatches(patient: RecordPatient, dicomName: string): boolean {
  const dicomTokens = new Set(nameTokens(dicomName));
  const covers = (...parts: string[]) => {
    const tokens = parts.flatMap((part) => nameTokens(part));
    return tokens.length > 0 && tokens.every((token) => dicomTokens.has(token));
  };
  return (
    covers(patient.firstName, patient.lastName) ||
    covers(patient.firstNameAr, patient.lastNameAr)
  );
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10).replace(/-/g, '');
}

const SEX_BY_GENDER: Record<string, string> = { FEMALE: 'F', MALE: 'M' };

export function compareIdentity(
  patient: RecordPatient,
  dicom: DicomPatientTags,
): IdentityWarning[] {
  const warnings: IdentityWarning[] = [];

  const name = dicom.patientName?.trim();
  if (name && !nameMatches(patient, name)) {
    warnings.push({ dicomValue: name, field: 'PatientName' });
  }

  const birthDate = dicom.patientBirthDate?.trim();
  if (birthDate && birthDate !== isoDay(patient.birthDate)) {
    warnings.push({ dicomValue: birthDate, field: 'PatientBirthDate' });
  }

  const sex = dicom.patientSex?.trim().toUpperCase();
  if (sex && sex !== SEX_BY_GENDER[patient.gender]) {
    warnings.push({ dicomValue: sex, field: 'PatientSex' });
  }

  return warnings;
}
