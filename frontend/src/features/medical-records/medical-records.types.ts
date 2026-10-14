export type LocalizedClinicalText = {
  ar: string;
  fr: string;
};

export type MedicalRecordCoverage = "CNAS" | "CASNOS" | "UNINSURED" | "PRIVATE";
export type MedicalRecordSex = "FEMALE" | "MALE";
export type MedicalRecordStatus = "ACTIVE" | "FOLLOW_UP" | "URGENT";

export type MedicalRecordEvent = {
  author?: LocalizedClinicalText;
  date: string;
  detail: LocalizedClinicalText;
  id: string;
  title: LocalizedClinicalText;
};

export type MedicalRecordPatient = {
  accessHistory: MedicalRecordEvent[];
  alerts: LocalizedClinicalText[];
  allergies: LocalizedClinicalText[];
  birthDate: string;
  bloodGroup: string;
  chronicConditions: LocalizedClinicalText[];
  commune: LocalizedClinicalText;
  consents: MedicalRecordEvent[];
  consultations: MedicalRecordEvent[];
  coverage: MedicalRecordCoverage;
  coverageNumber: string | null;
  currentMedications: LocalizedClinicalText[];
  doctor: LocalizedClinicalText;
  documents: MedicalRecordEvent[];
  emergencyContact: {
    name: LocalizedClinicalText;
    phone: string;
    relationship: LocalizedClinicalText;
  };
  examinations: MedicalRecordEvent[];
  firstName: string;
  firstNameAr: string;
  id: string;
  imaging: MedicalRecordEvent[];
  internalRecordNumber: string;
  lastConsultation: string | null;
  lastName: string;
  lastNameAr: string;
  lastUpdated: string;
  nin: string;
  sex: MedicalRecordSex;
  status: MedicalRecordStatus;
  treatments: MedicalRecordEvent[];
  wilaya: LocalizedClinicalText;
};

export type MedicalRecordTab =
  | "summary"
  | "consultations"
  | "history"
  | "treatments"
  | "documents"
  | "imaging"
  | "consents"
  | "access";
