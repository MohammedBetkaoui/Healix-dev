// Mirrors the Prisma PatientBloodGroup enum. Frontend display mapping:
// A_POS="A+", A_NEG="A-", B_POS="B+", B_NEG="B-", AB_POS="AB+", AB_NEG="AB-",
// O_POS="O+", O_NEG="O-".
export const PatientBloodGroup = {
  A_POS: 'A_POS',
  A_NEG: 'A_NEG',
  B_POS: 'B_POS',
  B_NEG: 'B_NEG',
  AB_POS: 'AB_POS',
  AB_NEG: 'AB_NEG',
  O_POS: 'O_POS',
  O_NEG: 'O_NEG',
} as const;

export type PatientBloodGroup =
  (typeof PatientBloodGroup)[keyof typeof PatientBloodGroup];
