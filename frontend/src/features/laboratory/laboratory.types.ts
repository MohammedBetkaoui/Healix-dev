export type LabLocalizedText = {
  ar: string;
  fr: string;
};

export type LabCategory =
  | "HEMATOLOGY"
  | "BIOCHEMISTRY"
  | "MICROBIOLOGY"
  | "IMMUNOLOGY"
  | "HORMONOLOGY"
  | "PARASITOLOGY";

export type LabPriority = "ROUTINE" | "URGENT";

export type LabRequestStatus =
  | "PRESCRIBED"
  | "TO_COLLECT"
  | "COLLECTED"
  | "RECEIVED"
  | "IN_ANALYSIS"
  | "TO_VALIDATE"
  | "VALIDATED"
  | "AVAILABLE"
  | "NON_CONFORMING";

export type LabResultIndicator = "NORMAL" | "LOW" | "HIGH" | "CRITICAL";

export type LabTraceEvent = {
  actor: LabLocalizedText;
  date: string;
  detail: LabLocalizedText;
  id: string;
  title: LabLocalizedText;
};

export type LabResult = {
  id: string;
  indicator: LabResultIndicator;
  parameter: LabLocalizedText;
  previous?: {
    date: string;
    value: string;
  };
  reference: string;
  unit: string;
  value: string;
};

export type LabRequest = {
  category: LabCategory;
  createdAt: string;
  doctor: LabLocalizedText;
  enteredBy: LabLocalizedText | null;
  exams: LabLocalizedText[];
  id: string;
  labComment: LabLocalizedText | null;
  patient: {
    firstName: string;
    firstNameAr: string;
    internalRecordNumber: string;
    lastName: string;
    lastNameAr: string;
  };
  priority: LabPriority;
  reference: string;
  results: LabResult[];
  sample: {
    collectedAt: string | null;
    collectedBy: LabLocalizedText | null;
    conformity: "PENDING" | "CONFORMING" | "NON_CONFORMING";
    conformityComment: LabLocalizedText | null;
    receivedAt: string | null;
    type: LabLocalizedText;
  };
  service: LabLocalizedText;
  status: LabRequestStatus;
  trace: LabTraceEvent[];
  validation: {
    date: string;
    practitioner: LabLocalizedText;
  } | null;
};
