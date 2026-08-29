import {
  type PatientAiAnalysisResult,
  type PatientAiAnalysisType,
  type PatientBloodGroup,
  type PatientDocumentType,
  type PatientGender,
  type PatientAdministrativeStatus,
  type PatientInsurance,
  type PatientSector,
  type PatientStatus,
} from "@/types/patient";

export const patientGenderValues: PatientGender[] = ["MALE", "FEMALE"];

export const patientAdministrativeStatusValues: PatientAdministrativeStatus[] = [
  "ACTIVE",
  "INACTIVE",
  "DECEASED",
];

export const patientInsuranceValues: PatientInsurance[] = [
  "CNAS",
  "CASNOS",
  "UNINSURED",
  "PRIVATE",
];

export const patientSectorValues: PatientSector[] = [
  "PRIVATE",
  "PUBLIC",
  "CONVENTIONED",
];

export const algerianWilayas = [
  ["01", "Adrar"], ["02", "Chlef"], ["03", "Laghouat"],
  ["04", "Oum El Bouaghi"], ["05", "Batna"], ["06", "Béjaïa"],
  ["07", "Biskra"], ["08", "Béchar"], ["09", "Blida"],
  ["10", "Bouira"], ["11", "Tamanrasset"], ["12", "Tébessa"],
  ["13", "Tlemcen"], ["14", "Tiaret"], ["15", "Tizi Ouzou"],
  ["16", "Alger"], ["17", "Djelfa"], ["18", "Jijel"],
  ["19", "Sétif"], ["20", "Saïda"], ["21", "Skikda"],
  ["22", "Sidi Bel Abbès"], ["23", "Annaba"], ["24", "Guelma"],
  ["25", "Constantine"], ["26", "Médéa"], ["27", "Mostaganem"],
  ["28", "M'Sila"], ["29", "Mascara"], ["30", "Ouargla"],
  ["31", "Oran"], ["32", "El Bayadh"], ["33", "Illizi"],
  ["34", "Bordj Bou Arréridj"], ["35", "Boumerdès"], ["36", "El Tarf"],
  ["37", "Tindouf"], ["38", "Tissemsilt"], ["39", "El Oued"],
  ["40", "Khenchela"], ["41", "Souk Ahras"], ["42", "Tipaza"],
  ["43", "Mila"], ["44", "Aïn Defla"], ["45", "Naâma"],
  ["46", "Aïn Témouchent"], ["47", "Ghardaïa"], ["48", "Relizane"],
  ["49", "El M'Ghair"], ["50", "El Meniaa"], ["51", "Ouled Djellal"],
  ["52", "Bordj Badji Mokhtar"], ["53", "Béni Abbès"], ["54", "Timimoun"],
  ["55", "Touggourt"], ["56", "Djanet"], ["57", "In Salah"],
  ["58", "In Guezzam"],
] as const;

export const patientStatusValues: PatientStatus[] = [
  "ACTIVE",
  "FOLLOW_UP",
  "NEW",
  "URGENT",
];

export const patientBloodGroupValues: PatientBloodGroup[] = [
  "A+",
  "A-",
  "B+",
  "B-",
  "AB+",
  "AB-",
  "O+",
  "O-",
];

export const patientDocumentTypeValues: PatientDocumentType[] = [
  "PRESCRIPTION",
  "MEDICAL_REPORT",
  "MEDICAL_IMAGE",
  "DICOM",
];

export const patientAiAnalysisTypeValues: PatientAiAnalysisType[] = [
  "MRI",
  "CT_SCAN",
  "XRAY",
  "ECG",
];

export const patientAiAnalysisResultValues: PatientAiAnalysisResult[] = [
  "NORMAL",
  "ANOMALY_DETECTED",
];

export const patientAgeFilterValues = [
  "UNDER_18",
  "18_40",
  "41_60",
  "OVER_60",
] as const;

export const patientLastVisitFilterValues = [
  "LAST_7_DAYS",
  "LAST_30_DAYS",
  "LAST_90_DAYS",
] as const;
