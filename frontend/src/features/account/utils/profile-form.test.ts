import { AxiosError, type AxiosResponse } from "axios";

import { dictionaries } from "@/i18n";
import { translate } from "@/lib/i18n";

import { type AccountProfile, type UpdateProfilePayload } from "../types/account.types";
import { buildProfilePatch, isFieldLocked, profileFieldsOf, profileFormValues, submitProfile, validateProfile } from "./profile-form";

const t = (key: string, params?: Record<string, string | number>) => translate(dictionaries.fr, key, params);

const doctor = (overrides: Partial<AccountProfile> = {}): AccountProfile => ({
  accountStatus: "ACTIVE",
  createdAt: "2026-01-10T09:00:00.000Z",
  doctor: { address: "12 rue Didouche Mourad, Alger", establishmentName: null, isIndependent: true, speciality: "Cardiologie", wilaya: "Alger" },
  email: "doctor@example.dz",
  establishment: null,
  fullName: "Samir Kaci",
  id: "u1",
  isEmailVerified: false,
  isPhoneVerified: true,
  kind: "DOCTOR",
  lockedFields: [],
  phone: "0550000001",
  role: "INDEPENDENT_DOCTOR",
  subscriptionStatus: "NO_PLAN",
  verificationStatus: "NOT_STARTED",
  workspaceAccess: null,
  ...overrides,
});
const verifiedDoctor = () => doctor({ lockedFields: ["fullName", "speciality", "wilaya"], verificationStatus: "VERIFIED" });
const refusal = (status: number, data: unknown) => new AxiosError("failed", "ERR_BAD_REQUEST", undefined, undefined, { data, status } as AxiosResponse);
const send = jest.fn<Promise<AccountProfile>, [UpdateProfilePayload]>();

beforeEach(() => jest.resetAllMocks());

describe("buildProfilePatch", () => {
  it("sends the fields that changed, and nothing else", () => {
    const profile = doctor();

    expect(buildProfilePatch({ ...profileFormValues(profile), phone: " 0661  234 567 " }, profile)).toEqual({ phone: "0661 234 567" });
    expect(buildProfilePatch(profileFormValues(profile), profile)).toEqual({});
  });

  it("never sends a locked field of a verified account, whatever the form holds", () => {
    const profile = verifiedDoctor();
    const patch = buildProfilePatch(
      { ...profileFormValues(profile), address: "3 boulevard Krim Belkacem, Alger", fullName: "Autre Nom", speciality: "Pédiatrie", wilaya: "Oran" },
      profile,
    );

    expect(patch).toEqual({ address: "3 boulevard Krim Belkacem, Alger" });
  });

  it("sends the same fields before the verification is approved", () => {
    const profile = doctor();
    const patch = buildProfilePatch({ ...profileFormValues(profile), fullName: "Autre Nom", speciality: "Pédiatrie" }, profile);

    expect(patch).toEqual({ fullName: "Autre Nom", speciality: "Pédiatrie" });
  });
});

describe("locked fields", () => {
  it("are those of the identity once the account is verified, and only then", () => {
    const verified = verifiedDoctor();

    expect(["fullName", "speciality", "wilaya", "phone", "address"].map((field) => isFieldLocked(verified, field as never))).toEqual([true, true, true, false, false]);
    expect(isFieldLocked(doctor(), "fullName")).toBe(false);
  });

  it("are not checked: they are not the user's to correct", () => {
    const profile = verifiedDoctor();

    expect(validateProfile({ ...profileFormValues(profile), fullName: "", speciality: "" }, profile, t)).toEqual({});
  });
});

describe("profile of an establishment account", () => {
  const establishment = (overrides: Partial<AccountProfile> = {}): AccountProfile => ({
    ...doctor(),
    doctor: null,
    email: "clinic@example.dz",
    establishment: {
      address: "5 avenue de l'ALN, Blida",
      managerFullName: "Nadia Hamidi",
      name: "Clinique El Amel",
      phone: "0550000002",
      professionalEmail: "clinic@example.dz",
      type: "CLINIC",
      wilaya: "Blida",
    },
    fullName: "Nadia Hamidi",
    kind: "ESTABLISHMENT",
    lockedFields: [],
    phone: "0550000002",
    role: "ESTABLISHMENT_ADMIN",
    ...overrides,
  });

  it("edits only the personal data: fullName and phone", () => {
    const profile = establishment();

    expect(profileFieldsOf("ESTABLISHMENT")).toEqual(["fullName", "phone"]);
    expect(buildProfilePatch({ ...profileFormValues(profile), establishmentName: "Autre clinique", fullName: "Nadia Hamidi-Kaci", phone: "0770112233", wilaya: "Oran" }, profile)).toEqual({
      fullName: "Nadia Hamidi-Kaci",
      phone: "0770112233",
    });
  });

  it("validates the personal fields only, and sends them", async () => {
    const profile = establishment();
    const saved = establishment({ isPhoneVerified: false, fullName: "Nadia Hamidi-Kaci", phone: "0770112233" });
    send.mockResolvedValue(saved);

    await expect(submitProfile({ ...profileFormValues(profile), fullName: "N", address: "ab" }, profile, { send, t })).resolves.toMatchObject({
      errors: { fullName: t("account.common.required") },
      status: "invalid",
    });

    await expect(submitProfile({ ...profileFormValues(profile), fullName: "Nadia Hamidi-Kaci" }, profile, { send, t })).resolves.toEqual({
      profile: saved,
      status: "success",
    });
    expect(send).toHaveBeenCalledWith({ fullName: "Nadia Hamidi-Kaci" });
  });
});

describe("validateProfile", () => {
  it("flags an invalid phone and an address that is too short", () => {
    const profile = doctor();

    expect(validateProfile({ ...profileFormValues(profile), address: "ab", phone: "pas un numéro" }, profile, t)).toEqual({
      address: t("account.common.required"),
      phone: t("register.errors.phoneInvalid"),
    });
  });
});

describe("submitProfile", () => {
  it("sends nothing when nothing changed", async () => {
    const profile = doctor();

    await expect(submitProfile(profileFormValues(profile), profile, { send, t })).resolves.toEqual({ status: "unchanged" });
    expect(send).not.toHaveBeenCalled();
  });  it("returns the profile the server answers", async () => {
    const profile = doctor();
    const saved = doctor({ isPhoneVerified: false, phone: "0661234567" });
    send.mockResolvedValue(saved);

    await expect(submitProfile({ ...profileFormValues(profile), phone: "0661234567" }, profile, { send, t })).resolves.toEqual({ profile: saved, status: "success" });
    expect(send).toHaveBeenCalledWith({ phone: "0661234567" });
  });

  it("shows a phone number that is taken next to the phone field", async () => {
    const profile = doctor();
    send.mockRejectedValue(refusal(409, { code: "PHONE_ALREADY_USED", message: "Ce numéro de téléphone est déjà utilisé." }));

    await expect(submitProfile({ ...profileFormValues(profile), phone: "0550000003" }, profile, { send, t })).resolves.toEqual({
      errors: { phone: t("account.errors.phoneAlreadyUsed") },
      message: null,
      status: "failed",
    });
  });

  it("shows a refused locked field next to each of the fields it names", async () => {
    const profile = doctor();
    send.mockRejectedValue(refusal(409, { code: "PROFILE_FIELD_LOCKED", fields: ["fullName", "wilaya"] }));

    await expect(submitProfile({ ...profileFormValues(profile), fullName: "Autre Nom", wilaya: "Oran" }, profile, { send, t })).resolves.toEqual({
      errors: { fullName: t("account.errors.fieldLocked"), wilaya: t("account.errors.fieldLocked") },
      message: null,
      status: "failed",
    });
  });

  it("does not call the API for a form that is invalid", async () => {
    const profile = doctor();

    await expect(submitProfile({ ...profileFormValues(profile), phone: "12" }, profile, { send, t })).resolves.toMatchObject({ status: "invalid" });
    expect(send).not.toHaveBeenCalled();
  });
});
