// Ported 1:1 from frontend/src/features/patients/patient-registry.ts
// (normalizePatientSearch / findPotentialPatientDuplicate) so the frontend's
// client-side check and this server-side check never diverge on what counts
// as a potential duplicate.

const transliterationAliases: Record<string, string> = {
  mohamed: 'mohamed',
  mohammad: 'mohamed',
  mohammed: 'mohamed',
  muhammad: 'mohamed',
  muhamed: 'mohamed',
  abdallah: 'abdellah',
  abdullah: 'abdellah',
};

function removeArabicDiacritics(value: string): string {
  return value.replace(/[ؐ-ًؚ-ٰٟۖ-ۭ]/g, '');
}

export function normalizePatientSearch(value: string): string {
  const cleaned = removeArabicDiacritics(value)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLocaleLowerCase('fr')
    .replace(/[’']/g, '')
    .replace(/[-_/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned
    .split(' ')
    .map((token) => transliterationAliases[token] ?? token)
    .join('');
}

export type PatientMatchReason = 'IDENTITY' | 'PHONE' | 'NIN';

export type PatientDuplicateCheckInput = {
  firstName?: string;
  lastName?: string;
  firstNameAr?: string;
  lastNameAr?: string;
  birthDate?: string;
  phone?: string;
  nationalId?: string;
};

export type PatientMatchCandidate = {
  birthDate: Date;
  firstName: string;
  firstNameAr: string;
  lastName: string;
  lastNameAr: string;
  nationalId: string;
  phone: string;
};

export type PatientMatch<T extends PatientMatchCandidate> = {
  patient: T;
  reasons: PatientMatchReason[];
};

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function findPatientMatches<T extends PatientMatchCandidate>(
  input: PatientDuplicateCheckInput,
  candidates: T[],
): PatientMatch<T>[] {
  const normalizedName = normalizePatientSearch(
    `${input.firstName ?? ''} ${input.lastName ?? ''}`,
  );
  const normalizedArabicName = normalizePatientSearch(
    `${input.firstNameAr ?? ''} ${input.lastNameAr ?? ''}`,
  );
  const phone = (input.phone ?? '').replace(/\D/g, '');
  const nationalId = (input.nationalId ?? '').replace(/\D/g, '');

  return candidates
    .map((patient) => {
      const reasons: PatientMatchReason[] = [];
      const sameLatinName =
        normalizedName.length > 2 &&
        normalizePatientSearch(`${patient.firstName} ${patient.lastName}`) ===
          normalizedName;
      const sameArabicName =
        normalizedArabicName.length > 2 &&
        normalizePatientSearch(
          `${patient.firstNameAr} ${patient.lastNameAr}`,
        ) === normalizedArabicName;

      if (
        (sameLatinName || sameArabicName) &&
        Boolean(input.birthDate) &&
        toDateOnly(patient.birthDate) === input.birthDate
      ) {
        reasons.push('IDENTITY');
      }
      if (phone.length >= 9 && patient.phone.replace(/\D/g, '') === phone) {
        reasons.push('PHONE');
      }
      if (
        nationalId.length >= 10 &&
        patient.nationalId.replace(/\D/g, '') === nationalId
      ) {
        reasons.push('NIN');
      }

      return { patient, reasons };
    })
    .filter((match) => match.reasons.length > 0)
    .sort((a, b) => b.reasons.length - a.reasons.length);
}
