export type AccountType = "ESTABLISHMENT" | "INDEPENDENT_DOCTOR";
export type LoginAccountType = "ESTABLISHMENT" | "INDEPENDENT_DOCTOR";

export const ESTABLISHMENT_TYPE_OPTIONS = [
  { value: "CLINIC", translationKey: "clinic" },
  { value: "HOSPITAL", translationKey: "hospital" },
  { value: "IMAGING_CENTER", translationKey: "imagingCenter" },
  { value: "LABORATORY", translationKey: "laboratory" },
  { value: "GROUP_PRACTICE", translationKey: "groupPractice" },
] as const;

export const ESTABLISHMENT_TYPES = [
  "CLINIC",
  "HOSPITAL",
  "IMAGING_CENTER",
  "LABORATORY",
  "GROUP_PRACTICE",
] as const;

export type EstablishmentType = (typeof ESTABLISHMENT_TYPES)[number];

export const ALGERIAN_WILAYAS = [
  "Adrar",
  "Chlef",
  "Laghouat",
  "Oum El Bouaghi",
  "Batna",
  "Béjaïa",
  "Biskra",
  "Béchar",
  "Blida",
  "Bouira",
  "Tamanrasset",
  "Tébessa",
  "Tlemcen",
  "Tiaret",
  "Tizi Ouzou",
  "Alger",
  "Djelfa",
  "Jijel",
  "Sétif",
  "Saïda",
  "Skikda",
  "Sidi Bel Abbès",
  "Annaba",
  "Guelma",
  "Constantine",
  "Médéa",
  "Mostaganem",
  "M’Sila",
  "Mascara",
  "Ouargla",
  "Oran",
  "El Bayadh",
  "Illizi",
  "Bordj Bou Arréridj",
  "Boumerdès",
  "El Tarf",
  "Tindouf",
  "Tissemsilt",
  "El Oued",
  "Khenchela",
  "Souk Ahras",
  "Tipaza",
  "Mila",
  "Aïn Defla",
  "Naâma",
  "Aïn Témouchent",
  "Ghardaïa",
  "Relizane",
  "Timimoun",
  "Bordj Badji Mokhtar",
  "Ouled Djellal",
  "Béni Abbès",
  "In Salah",
  "In Guezzam",
  "Touggourt",
  "Djanet",
  "El M’Ghair",
  "El Meniaa",
] as const;

export type Wilaya = (typeof ALGERIAN_WILAYAS)[number];

export type EstablishmentRegisterInput = {
  accountType: "ESTABLISHMENT";
  establishmentName: string;
  establishmentType: EstablishmentType;
  wilaya: Wilaya;
  address: string;
  professionalEmail: string;
  phone: string;
  managerFullName: string;
  password: string;
  confirmPassword: string;
  acceptTerms: boolean;
  acceptVerification: boolean;
};

export type EstablishmentRegisterFormValues = Omit<
  EstablishmentRegisterInput,
  "establishmentType" | "wilaya"
> & {
  establishmentType: string;
  wilaya: string;
};

export type IndependentDoctorRegisterInput = {
  accountType: "INDEPENDENT_DOCTOR";
  fullName: string;
  speciality: string;
  wilaya: Wilaya;
  professionalAddress: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
  acceptTerms: boolean;
  acceptVerification: boolean;
};

export type IndependentDoctorRegisterFormValues = Omit<
  IndependentDoctorRegisterInput,
  "wilaya"
> & {
  wilaya: string;
};

export type LoginFormInput = {
  accountType: LoginAccountType;
  email: string;
  password: string;
  rememberMe: boolean;
};

export type LoginFormValues = Omit<LoginFormInput, "accountType"> & {
  accountType: LoginAccountType | "";
};

export type LoginMockResponse = {
  accountStatus: "BASIC_ACCOUNT";
  redirectTo: "/establishment/dashboard" | "/doctor/dashboard";
};
