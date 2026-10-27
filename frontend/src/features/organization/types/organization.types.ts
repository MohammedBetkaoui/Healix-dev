import { type EstablishmentType } from "@/types/auth";

// Mirror of backend/src/team capabilities subset used by this page.

export const OPENING_HOURS_DAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;
export type OpeningHoursDay = (typeof OPENING_HOURS_DAYS)[number];

export type OpeningHoursPeriod = { start: string; end: string };

export type OpeningHoursStructure = Record<
  OpeningHoursDay,
  { closed: boolean; periods: OpeningHoursPeriod[] }
>;

export type OrganizationVerificationStatus =
  | "NOT_STARTED"
  | "DRAFT"
  | "PENDING_VERIFICATION"
  | "VERIFIED"
  | "REJECTED"
  | "SUSPENDED";

export type OrganizationSubscriptionStatus =
  | "NO_PLAN"
  | "PAYMENT_PENDING"
  | "ACTIVE"
  | "EXPIRED"
  | "CANCELED"
  | "TRIALING";

// The legal paperwork of the establishment, read from the verification data.
// `locked` says the establishment is VERIFIED: the values then never change
// through this page. The national ID of the representative is deliberately
// absent from this type: the page never displays it, not even masked.
export type OrganizationLegal = {
  locked: boolean;
  legalForm: string | null;
  commercialRegisterNumber: string | null;
  commercialRegisterIssuedAt: string | null;
  commercialRegisterWilaya: string | null;
  nif: string | null;
  nis: string | null;
  taxCenter: string | null;
  healthAuthorizationNumber: string | null;
  healthAuthorizationIssuedAt: string | null;
  healthAuthorizationAuthority: string | null;
  healthDirectionWilaya: string | null;
  authorizedActivityType: string | null;
  representative: {
    fullName: string | null;
    function: string | null;
  } | null;
};

export type OrganizationResponse = {
  capabilities: string[];
  workspace: { id: string; type: "ESTABLISHMENT" | "PRIVATE_PRACTICE" };
  identity: {
    establishmentId: string;
    name: string;
    type: EstablishmentType;
    wilaya: string;
    commune: string | null;
    address: string;
    verificationStatus: OrganizationVerificationStatus;
    subscriptionStatus: OrganizationSubscriptionStatus;
    // Where the identity shown comes from: the verified data when a
    // verification exists, the registration data before that.
    source: "VERIFICATION_DATA" | "REGISTRATION_DATA";
  };
  legal: OrganizationLegal | null;
  contacts: {
    phone: string;
    professionalEmail: string;
    website: string | null;
  };
  settings: {
    openingHours: OpeningHoursStructure | null;
    defaultAppointmentDuration: number;
    dataProtectionOfficer: null | {
      name: string | null;
      email: string | null;
      phone: string | null;
    };
  };
};

// Only the fields sent change: an absent field keeps its value, an explicit
// null clears a clearable one (the backend refuses an empty string for that).
export type UpdateOrganizationPayload = {
  phone?: string;
  professionalEmail?: string;
  website?: string | null;
  defaultAppointmentDuration?: number;
  dataProtectionOfficerName?: string | null;
  dataProtectionOfficerEmail?: string | null;
  dataProtectionOfficerPhone?: string | null;
};

export type UpdateOpeningHoursPayload = { openingHours: OpeningHoursStructure };
