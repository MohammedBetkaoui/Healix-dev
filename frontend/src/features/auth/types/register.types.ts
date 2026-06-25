export type AccountType = "ESTABLISHMENT" | "INDEPENDENT_DOCTOR";

export type EstablishmentType =
  | "CLINIC"
  | "HOSPITAL"
  | "IMAGING_CENTER"
  | "LABORATORY"
  | "GROUP_PRACTICE";

export type EstablishmentRegisterPayload = {
  establishmentName: string;
  establishmentType: EstablishmentType;
  wilaya: string;
  address: string;
  professionalEmail: string;
  phone: string;
  managerFullName: string;
  password: string;
  confirmPassword: string;
  acceptTerms: boolean;
  acceptVerification: boolean;
};

export type RegisterEstablishmentResponse = {
  message: string;
  user: {
    id: string;
    fullName: string;
    email: string;
    phone: string;
    role: "ESTABLISHMENT_ADMIN";
    accountStatus: "BASIC_ACCOUNT";
  };
  establishment: {
    id: string;
    name: string;
    type: EstablishmentType;
    wilaya: string;
    verificationStatus: "NOT_STARTED";
    subscriptionStatus: "NO_PLAN";
  };
  nextStep: "PROFESSIONAL_VERIFICATION";
};

export type IndependentDoctorRegisterPayload = {
  fullName: string;
  speciality: string;
  wilaya: string;
  professionalAddress: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
  acceptTerms: boolean;
  acceptVerification: boolean;
};

export type RegisterIndependentDoctorResponse = {
  message: string;
  user: {
    id: string;
    fullName: string;
    email: string;
    phone: string;
    role: "INDEPENDENT_DOCTOR";
    accountStatus: "BASIC_ACCOUNT";
  };
  doctorProfile: {
    id: string;
    speciality: string;
    wilaya: string;
    isIndependent: true;
    verificationStatus: "NOT_STARTED";
    subscriptionStatus: "NO_PLAN";
  };
  nextStep: "PROFESSIONAL_VERIFICATION";
};

export type RegisterApiError = {
  details?: string[];
  message: string;
  status?: number;
  title?: string;
};
