import {
  type EstablishmentType,
  type SubscriptionStatus,
  type VerificationStatus as PrismaVerificationStatus,
  type WorkspaceType,
} from '@prisma/client';

import { VerificationStatus } from '../../common/enums/verification-status.enum';
import { normalizeEmail, sanitizePhone, sanitizeTextInput } from '../../common/utils/sanitize';
import {
  OpeningHoursStructure,
  readOpeningHours,
} from '../dto/update-opening-hours.dto';

// What one GET returns for the organization of one workspace. The caller's
// capabilities come along so the interface hides what the role cannot do
// without a second request. legalRepresentativeNinOrId is deliberately absent
// from every type below: the organization page never displays the national ID
// of the representative, not even masked.
export type OrganizationResponse = {
  capabilities: readonly string[];
  workspace: { id: string; type: WorkspaceType };
  identity: {
    establishmentId: string;
    name: string;
    type: EstablishmentType;
    wilaya: string;
    commune: string | null;
    address: string;
    verificationStatus: PrismaVerificationStatus;
    subscriptionStatus: SubscriptionStatus;
    // Where the identity shown comes from: the verified data when a
    // verification exists, the registration data before that.
    source: 'VERIFICATION_DATA' | 'REGISTRATION_DATA';
  };
  legal:
    | null
    | {
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
  contacts: {
    phone: string;
    professionalEmail: string;
    website: string | null;
  };
  settings: {
    openingHours: OpeningHoursStructure | null;
    defaultAppointmentDuration: number;
    dataProtectionOfficer:
      | null
      | {
          name: string | null;
          email: string | null;
          phone: string | null;
        };
  };
};

export type OrganizationVerificationDataSelected = {
  name: string;
  type: EstablishmentType;
  legalForm: string | null;
  wilaya: string;
  commune: string | null;
  address: string;
  commercialRegisterNumber: string | null;
  commercialRegisterIssuedAt: Date | null;
  commercialRegisterWilaya: string | null;
  nif: string | null;
  nis: string | null;
  taxCenter: string | null;
  healthAuthorizationNumber: string | null;
  healthAuthorizationIssuedAt: Date | null;
  healthAuthorizationAuthority: string | null;
  healthDirectionWilaya: string | null;
  authorizedActivityType: string | null;
  legalRepresentativeFullName: string | null;
  legalRepresentativeFunction: string | null;
};

// Only the fields the mapper reads: the service's prisma select is
// structurally compatible with this contract.
export type OrganizationMapperInput = {
  workspaceId: string;
  workspaceType: WorkspaceType;
  capabilities: readonly string[];
  scope: 'FULL' | 'BASIC';
  establishment: {
    id: string;
    name: string;
    type: EstablishmentType;
    wilaya: string;
    address: string;
    phone: string;
    professionalEmail: string;
    verificationStatus: PrismaVerificationStatus;
    subscriptionStatus: SubscriptionStatus;
    verificationRequest: {
      data: OrganizationVerificationDataSelected | null;
    } | null;
  };
  // The raw openingHours column: a corrupted or hand-edited value is dropped
  // (null) instead of breaking the response.
  openingHours: unknown;
  defaultAppointmentDuration: number;
  website: string | null;
  dpoName: string | null;
  dpoEmail: string | null;
  dpoPhone: string | null;
};

export function mapOrganizationResponse(
  input: OrganizationMapperInput,
): OrganizationResponse {
  const { establishment } = input;
  const verificationData = establishment.verificationRequest?.data ?? null;
  const isVerified =
    establishment.verificationStatus === VerificationStatus.VERIFIED;
  const full = input.scope === 'FULL';

  return {
    capabilities: [...input.capabilities],
    workspace: { id: input.workspaceId, type: input.workspaceType },
    identity: {
      establishmentId: establishment.id,
      name: sanitizeTextInput(verificationData?.name ?? establishment.name),
      type: verificationData?.type ?? establishment.type,
      wilaya: sanitizeTextInput(
        verificationData?.wilaya ?? establishment.wilaya,
      ),
      commune: verificationData?.commune
        ? sanitizeTextInput(verificationData.commune)
        : null,
      address: sanitizeTextInput(
        verificationData?.address ?? establishment.address,
      ),
      verificationStatus: establishment.verificationStatus,
      subscriptionStatus: establishment.subscriptionStatus,
      source: verificationData ? 'VERIFICATION_DATA' : 'REGISTRATION_DATA',
    },
    // Tax, health-authorization and representative details are management
    // information: a DOCTOR sees that the establishment is verified but not
    // its legal paperwork, and the identity is editable nowhere in any case.
    legal:
      verificationData && full
        ? {
            locked: isVerified,
            legalForm: verificationData.legalForm,
            commercialRegisterNumber: verificationData.commercialRegisterNumber,
            commercialRegisterIssuedAt:
              verificationData.commercialRegisterIssuedAt?.toISOString() ??
              null,
            commercialRegisterWilaya: verificationData.commercialRegisterWilaya,
            nif: verificationData.nif,
            nis: verificationData.nis,
            taxCenter: verificationData.taxCenter,
            healthAuthorizationNumber:
              verificationData.healthAuthorizationNumber,
            healthAuthorizationIssuedAt:
              verificationData.healthAuthorizationIssuedAt?.toISOString() ??
              null,
            healthAuthorizationAuthority:
              verificationData.healthAuthorizationAuthority,
            healthDirectionWilaya: verificationData.healthDirectionWilaya,
            authorizedActivityType: verificationData.authorizedActivityType,
            representative: {
              fullName: verificationData.legalRepresentativeFullName,
              function: verificationData.legalRepresentativeFunction,
            },
          }
        : null,
    // Operational contacts live on the establishment row / settings row, they
    // never shadow the verification snapshot and are never written into it.
    contacts: {
      phone: sanitizePhone(establishment.phone),
      professionalEmail: normalizeEmail(establishment.professionalEmail),
      website: input.website,
    },
    settings: {
      openingHours: readOpeningHours(input.openingHours),
      defaultAppointmentDuration: input.defaultAppointmentDuration,
      dataProtectionOfficer:
        full &&
        (input.dpoName || input.dpoEmail || input.dpoPhone)
          ? {
              name: input.dpoName,
              email: input.dpoEmail,
              phone: input.dpoPhone,
            }
          : null,
    },
  };
}
