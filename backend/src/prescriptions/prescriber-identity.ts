import { type Prisma } from '@prisma/client';

// Where the identity printed on a prescription comes from. One source for the
// two places that need it: PrescriptionAuthorizationService (the frozen
// snapshots of a validated prescription, rendered by PrescriptionPdfService)
// and SyncService.bootstrap (what the desktop prints offline).

type EstablishmentSource = {
  id: string;
  name: string;
  address: string;
  wilaya: string;
  phone: string;
};

type VerificationSource = {
  orderRegistrationNumber?: string | null;
  regionalCouncil?: string | null;
  cabinetName?: string | null;
  cabinetAddress?: string | null;
  cabinetWilaya?: string | null;
  cabinetPhone?: string | null;
} | null;

// The organization of a prescription: the establishment of an affiliated
// doctor, the doctor's own cabinet otherwise.
export function organizationSnapshot(
  profile: {
    establishment: EstablishmentSource | null;
    professionalAddress: string;
    wilaya: string;
  },
  account: { fullName: string; phone: string },
  verification: VerificationSource | undefined,
) {
  return profile.establishment
    ? profile.establishment
    : {
        id: null,
        name: verification?.cabinetName ?? `Cabinet du Dr ${account.fullName}`,
        address: verification?.cabinetAddress ?? profile.professionalAddress,
        wilaya: verification?.cabinetWilaya ?? profile.wilaya,
        phone: verification?.cabinetPhone ?? account.phone,
      };
}

export const printIdentitySelect = {
  fullName: true,
  phone: true,
  doctorProfile: {
    select: {
      speciality: true,
      professionalAddress: true,
      wilaya: true,
      establishment: {
        select: {
          id: true,
          name: true,
          address: true,
          wilaya: true,
          phone: true,
        },
      },
      verificationRequest: {
        select: {
          doctorData: {
            select: {
              orderRegistrationNumber: true,
              regionalCouncil: true,
              cabinetName: true,
              cabinetAddress: true,
              cabinetWilaya: true,
              cabinetPhone: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.UserSelect;

type PrintIdentityAccount = Prisma.UserGetPayload<{
  select: typeof printIdentitySelect;
}>;

// What the desktop needs to print a prescription offline, and nothing more: the
// five lines of the "Prescripteur" block and the four of the header. No id, no
// e-mail, no personal phone (the organization's phone is the cabinet's).
export function toPrintIdentity(account: PrintIdentityAccount) {
  const profile = account.doctorProfile;
  if (!profile) return { prescriber: null, organization: null };
  const verification = profile.verificationRequest?.doctorData ?? null;
  const organization = organizationSnapshot(profile, account, verification);
  return {
    prescriber: {
      fullName: account.fullName,
      speciality: profile.speciality,
      registrationNumber: verification?.orderRegistrationNumber ?? null,
      regionalCouncil: verification?.regionalCouncil ?? null,
      professionalAddress: profile.professionalAddress,
    },
    organization: {
      name: organization.name,
      address: organization.address,
      wilaya: organization.wilaya,
      phone: organization.phone,
    },
  };
}
