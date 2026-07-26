import { type PatientAccountType } from "@/types/patient";

export type PatientRole = "ROLE_DOCTOR" | "ROLE_ESTABLISHMENT";

export type PatientPermission =
  | "ASSIGN_DOCTOR"
  | "CREATE_AI_ANALYSIS"
  | "CREATE_PATIENT"
  | "MANAGE_PATIENT"
  | "UPDATE_PATIENT"
  | "VIEW_ALL_PATIENTS"
  | "VIEW_MEDICAL_RECORD"
  | "VIEW_PATIENT"
  | "VIEW_REPORTS";

const rolePermissions: Record<PatientRole, PatientPermission[]> = {
  ROLE_DOCTOR: [
    "VIEW_PATIENT",
    "CREATE_PATIENT",
    "UPDATE_PATIENT",
    "VIEW_MEDICAL_RECORD",
    "CREATE_AI_ANALYSIS",
  ],
  ROLE_ESTABLISHMENT: [
    "VIEW_ALL_PATIENTS",
    "MANAGE_PATIENT",
    "ASSIGN_DOCTOR",
    "VIEW_REPORTS",
    "CREATE_PATIENT",
    "UPDATE_PATIENT",
    "VIEW_MEDICAL_RECORD",
    "CREATE_AI_ANALYSIS",
  ],
};

export function getPatientRole(accountType: PatientAccountType): PatientRole {
  return accountType === "ESTABLISHMENT" ? "ROLE_ESTABLISHMENT" : "ROLE_DOCTOR";
}

export function getPatientPermissions(
  accountType: PatientAccountType,
): PatientPermission[] {
  return rolePermissions[getPatientRole(accountType)];
}

export function hasPatientPermission(
  accountType: PatientAccountType,
  permission: PatientPermission,
) {
  // Medical data security must be enforced by backend authorization.
  return getPatientPermissions(accountType).includes(permission);
}
