import { dictionaries } from "@/i18n";
import { translate } from "@/lib/i18n";

import { createPatientFormSchema, getPatientFormValues } from "./patient-form";

// The values the form sends must survive backend/src/patients/dto/create-patient.dto.ts:
// anything zod lets through here would only fail with a 400 once reaching the
// API — exactly the opaque "Une erreur est survenue" a doctor used to get by
// leaving the NIN empty.
const t = (key: string) => translate(dictionaries.fr, key);

const validValues = {
  ...getPatientFormValues(),
  address: "12 rue Didouche Mourad",
  birthDate: "1990-05-12",
  commune: "Alger Centre",
  doctorRegistrationNumber: "12040123",
  emergencyContactName: "Yacine Benali",
  emergencyContactPhone: "0770 11 22 33",
  firstName: "Amina",
  firstNameAr: "أمينة",
  gender: "FEMALE",
  healthDataConsent: true,
  insurance: "CNAS",
  lastName: "Benali",
  lastNameAr: "بن علي",
  nationalId: "123456789012345678",
  phone: "0555123456",
  referringDoctor: "Dr Samir Kaci",
  sector: "PUBLIC",
  wilaya: "16|Alger",
} as const;

const issuesOn = (field: string, values: Record<string, unknown>) =>
  createPatientFormSchema(t)
    .safeParse({ ...validValues, ...values })
    .error?.issues.filter((issue) => issue.path[0] === field);

describe("createPatientFormSchema", () => {
  it("accepts the exact payload shape the modal sends", () => {
    expect(createPatientFormSchema(t).safeParse(validValues).success).toBe(true);
  });

  it("rejects an empty NIN — the value that used to reach the API as a 400", () => {
    const issues = issuesOn("nationalId", { nationalId: "" });
    expect(issues).toHaveLength(1);
    expect(issuesOn("nationalId", { nationalId: "1234567890123456" })).toHaveLength(1);
    // Spaces inside the number are tolerated, as the DTO strips nothing but the form does.
    expect(createPatientFormSchema(t).safeParse({
      ...validValues,
      nationalId: "1234 5678 9012 3456 78",
    }).success).toBe(true);
  });

  it("requires two characters on the names and the commune, like the DTO", () => {
    expect(issuesOn("firstName", { firstName: "A" })).toHaveLength(1);
    expect(issuesOn("lastName", { lastName: "B" })).toHaveLength(1);
    expect(issuesOn("firstNameAr", { firstNameAr: "أ" })).toHaveLength(1);
    expect(issuesOn("lastNameAr", { lastNameAr: "ب" })).toHaveLength(1);
    expect(issuesOn("commune", { commune: "X" })).toHaveLength(1);
  });

  it("counts the digits of the emergency contact phone, not its characters", () => {
    // "05 55" is 5 characters but 4 digits: the payload strips the separators.
    expect(issuesOn("emergencyContactPhone", { emergencyContactPhone: "05 55" })).toHaveLength(1);
    expect(issuesOn("emergencyContactPhone", { emergencyContactPhone: "05 55 11" })).toBeUndefined();
  });
});
