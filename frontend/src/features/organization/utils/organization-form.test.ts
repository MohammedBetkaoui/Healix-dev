import { AxiosError, type AxiosResponse } from "axios";

import { type TranslationFunction } from "@/lib/i18n";

import {
  OPENING_HOURS_DAYS,
  type OpeningHoursStructure,
  type OrganizationResponse,
} from "../types/organization.types";
import {
  APPOINTMENT_DURATIONS,
  buildContactsPatch,
  buildDataProtectionPatch,
  buildOpeningHoursPayload,
  contactsFormValues,
  dataProtectionFormValues,
  openingHoursValues,
  submitContacts,
  submitDataProtection,
  submitOpeningHours,
  validateContacts,
  validateDataProtection,
  validateOpeningHours,
} from "./organization-form";

const t = ((key: string) => key) as TranslationFunction;

const organization = (
  overrides: Partial<OrganizationResponse> = {},
): OrganizationResponse => ({
  capabilities: [
    "organization.read",
    "organization.readBasic",
    "organization.updateOperational",
    "team.read",
    "team.readBasic",
    "team.inviteDoctor",
    "team.revokeInvitation",
    "team.suspendMember",
    "team.reactivateMember",
    "team.sendPasswordReset",
  ],
  workspace: { id: "ws-1", type: "ESTABLISHMENT" },
  identity: {
    address: "5 avenue de l’ALN, Blida",
    establishmentId: "e1",
    name: "Clinique El Amel",
    source: "VERIFICATION_DATA",
    subscriptionStatus: "ACTIVE",
    type: "CLINIC",
    verificationStatus: "VERIFIED",
    wilaya: "Blida",
    commune: null,
  },
  legal: null,
  contacts: {
    phone: "0550 00 00 02",
    professionalEmail: "clinic@example.dz",
    website: null,
  },
  settings: {
    defaultAppointmentDuration: 30,
    dataProtectionOfficer: null,
    openingHours: null,
  },
  ...overrides,
});

const storedHours = (): OpeningHoursStructure => ({
  friday: { closed: true, periods: [] },
  monday: { closed: false, periods: [{ start: "08:00", end: "12:00" }] },
  saturday: {
    closed: false,
    periods: [
      { start: "09:00", end: "12:00" },
      { start: "14:00", end: "17:30" },
    ],
  },
  sunday: { closed: true, periods: [] },
  thursday: { closed: true, periods: [] },
  tuesday: { closed: false, periods: [{ start: "08:00", end: "16:00" }] },
  wednesday: { closed: true, periods: [] },
});

// ---------------------------------------------------------------- contacts --
describe("organization-form — contacts", () => {
  it("sends only what changed, and never a phone or e-mail that carries raw spacing", () => {
    const values = {
      ...contactsFormValues(organization()),
      phone: "0550 11 22 33",
      professionalEmail: "  contact@clinic.dz ",
      defaultAppointmentDuration: 30,
      website: "",
    };

    expect(buildContactsPatch(values, organization())).toEqual({
      phone: "0550 11 22 33",
      professionalEmail: "contact@clinic.dz",
    });
  });

  it("clears the website with an empty value only when one exists", () => {
    const values = contactsFormValues(organization());
    expect(buildContactsPatch(values, organization())).toEqual({});

    values.website = "";
    expect(
      buildContactsPatch(
        values,
        organization({
          contacts: { ...organization().contacts, website: null },
        }),
      ),
    ).toEqual({});

    expect(
      buildContactsPatch(
        values,
        organization({
          contacts: {
            ...organization().contacts,
            website: "https://clinic.dz",
          },
        }),
      ),
    ).toEqual({ website: null });
  });

  it("validates the required professional phone and the e-mail, in the contacts wording", () => {
    const values = contactsFormValues(organization());
    const missing = validateContacts(
      { ...values, phone: "", professionalEmail: "" },
      t,
    );
    expect(missing.phone).toBe("organization.contacts.errors.phoneRequired");
    expect(missing.professionalEmail).toBe(
      "organization.contacts.errors.emailRequired",
    );

    const invalid = validateContacts(
      {
        ...values,
        phone: "12345",
        professionalEmail: "not an email",
        website: "ftp://clinic.dz",
      },
      t,
    );
    expect(invalid.phone).toBe("organization.contacts.errors.phoneInvalid");
    expect(invalid.professionalEmail).toBe(
      "organization.contacts.errors.emailInvalid",
    );
    expect(invalid.website).toBe("organization.contacts.errors.website");

    expect(validateContacts(values, t)).toEqual({});
  });

  it("does not call the API when nothing changed, and sends one patch when it did", async () => {
    const send = jest.fn();

    await expect(
      submitContacts(contactsFormValues(organization()), organization(), {
        send,
        t,
      }),
    ).resolves.toEqual({ status: "unchanged" });
    expect(send).not.toHaveBeenCalled();

    send.mockResolvedValueOnce(
      organization({
        contacts: {
          phone: "0550 11 22 33",
          professionalEmail: "clinic@example.dz",
          website: null,
        },
      }),
    );
    const changed = {
      ...contactsFormValues(organization()),
      phone: "0550 11 22 33",
    };
    await expect(
      submitContacts(changed, organization(), { send, t }),
    ).resolves.toMatchObject({ status: "success" });
    expect(send).toHaveBeenCalledWith({ phone: "0550 11 22 33" });
  });

  it("names the field the backend refused, from the sentence of its DTO validation", async () => {
    const send = jest.fn();
    send.mockRejectedValueOnce(
      Object.assign(new AxiosError("x"), {
        response: {
          data: { message: ["Le téléphone professionnel est invalide."] },
          status: 400,
        } as AxiosResponse,
      }),
    );
    const changed = {
      ...contactsFormValues(organization()),
      phone: "0550 11 22 33",
    };
    const outcome = await submitContacts(changed, organization(), { send, t });

    if (outcome.status !== "failed") throw new Error("expected failed");
    expect(outcome.errors).toEqual({ phone: "organization.errors.invalid" });
  });
});

// ----------------------------------------------- data protection officer --
describe("organization-form — data protection officer", () => {
  it("sends only what changed of an optional set, and clears with an explicit null", () => {
    const values = {
      ...dataProtectionFormValues(organization()),
      email: "dpo@clinic.dz",
      name: "Nadia Hamidi",
      phone: "0550 00 00 09",
    };

    expect(buildDataProtectionPatch(values, organization())).toEqual({
      dataProtectionOfficerEmail: "dpo@clinic.dz",
      dataProtectionOfficerName: "Nadia Hamidi",
      dataProtectionOfficerPhone: "0550 00 00 09",
    });

    const withOfficer = organization({
      settings: {
        defaultAppointmentDuration: 30,
        dataProtectionOfficer: {
          email: "dpo@clinic.dz",
          name: "Nadia Hamidi",
          phone: "0550 00 00 09",
        },
        openingHours: null,
      },
    });
    expect(
      buildDataProtectionPatch(
        { ...values, email: "", name: "", phone: "" },
        withOfficer,
      ),
    ).toEqual({
      dataProtectionOfficerEmail: null,
      dataProtectionOfficerName: null,
      dataProtectionOfficerPhone: null,
    });

    expect(
      buildDataProtectionPatch(
        { ...values, email: "", name: "", phone: "" },
        organization(),
      ),
    ).toEqual({});
  });

  it("accepts empty optional fields, refuses a one-letter name and corrupt values", () => {
    const values = dataProtectionFormValues(organization());
    expect(validateDataProtection(values, t)).toEqual({});

    expect(validateDataProtection({ ...values, name: "D" }, t)).toEqual({
      name: "organization.protection.errors.nameTooShort",
    });
    expect(validateDataProtection({ ...values, email: "nope" }, t)).toEqual({
      email: "organization.protection.errors.emailInvalid",
    });
    expect(validateDataProtection({ ...values, phone: "nope" }, t)).toEqual({
      phone: "organization.protection.errors.phoneInvalid",
    });
  });

  it("saves the officer and refuses a forbidden update as a generic message", async () => {
    const send = jest
      .fn()
      .mockResolvedValueOnce(
        organization({
          settings: {
            defaultAppointmentDuration: 30,
            openingHours: null,
            dataProtectionOfficer: {
              email: "dpo@clinic.dz",
              name: "Nadia Hamidi",
              phone: null,
            },
          },
        }),
      );
    const values = {
      ...dataProtectionFormValues(organization()),
      email: "dpo@clinic.dz",
      name: "Nadia Hamidi",
    };

    const outcome = await submitDataProtection(values, organization(), {
      send,
      t,
    });
    expect(outcome).toMatchObject({ status: "success" });
    expect(send).toHaveBeenCalledWith({
      dataProtectionOfficerEmail: "dpo@clinic.dz",
      dataProtectionOfficerName: "Nadia Hamidi",
    });

    send.mockRejectedValueOnce(
      Object.assign(new AxiosError("x"), {
        response: { data: {}, status: 403 } as AxiosResponse,
      }),
    );
    await expect(
      submitDataProtection(values, organization(), { send, t }),
    ).resolves.toMatchObject({
      errors: {},
      message: "organization.errors.forbidden",
      status: "failed",
    });
  });
});

// ------------------------------------------------------------ opening hours --
describe("organization-form — opening hours", () => {
  it("starts everything closed when no schedule exists, and reads the stored one", () => {
    for (const day of OPENING_HOURS_DAYS) {
      expect(openingHoursValues(organization())[day]).toEqual({
        closed: true,
        periods: [],
      });
    }

    const stored = {
      ...organization(),
      settings: {
        defaultAppointmentDuration: 30,
        dataProtectionOfficer: null,
        openingHours: storedHours(),
      },
    };
    const values = openingHoursValues(stored);
    expect(values.monday.periods).toEqual([{ start: "08:00", end: "12:00" }]);
    // A closed day of the stored structure carries no period to edit.
    expect(values.friday.periods).toEqual([]);
  });

  it("refuses an open day without a period, and inverted or overlapping periods", () => {
    const t2 = t;
    const open = {
      ...openingHoursValues(organization()),
      monday: { closed: false, periods: [] },
    };
    expect(validateOpeningHours(open, t2)).toEqual({
      monday: "organization.hours.errors.noPeriod",
    });

    const inverted = {
      ...openingHoursValues(organization()),
      monday: { closed: false, periods: [{ start: "17:00", end: "08:00" }] },
    };
    expect(validateOpeningHours(inverted, t2)).toEqual({
      monday: "organization.hours.errors.startBeforeEnd",
    });

    const touching = {
      ...openingHoursValues(organization()),
      monday: {
        closed: false,
        periods: [
          { start: "08:00", end: "12:00" },
          { start: "09:00", end: "13:00" },
        ],
      },
    };
    expect(validateOpeningHours(touching, t2)).toEqual({
      monday: "organization.hours.errors.overlap",
    });

    const backToBack = {
      ...openingHoursValues(organization()),
      monday: {
        closed: false,
        periods: [
          { start: "12:00", end: "14:00" },
          { start: "08:00", end: "12:00" },
        ],
      },
    };
    expect(validateOpeningHours(backToBack, t2)).toEqual({});
  });

  it("sends the exact structure: closed days without periods, open days sorted by start", () => {
    const values = {
      ...openingHoursValues(organization()),
      monday: {
        closed: false,
        periods: [
          { start: "12:00", end: "16:00" },
          { start: "08:00", end: "12:00" },
        ],
      },
      friday: { closed: false, periods: [{ start: "08:00", end: "09:00" }] },
    };

    const payload = buildOpeningHoursPayload(values);
    expect(Object.keys(payload.openingHours)).toEqual(
      OPENING_HOURS_DAYS.slice(),
    );
    expect(payload.openingHours.monday).toEqual({
      closed: false,
      periods: [
        { start: "08:00", end: "12:00" },
        { start: "12:00", end: "16:00" },
      ],
    });
    expect(payload.openingHours.tuesday).toEqual({ closed: true, periods: [] });
    expect(payload.openingHours.friday).toEqual({
      closed: false,
      periods: [{ start: "08:00", end: "09:00" }],
    });
  });

  it("saves the schedule and answers the generic hours message when the backend refuses it", async () => {
    const send = jest
      .fn()
      .mockResolvedValueOnce({
        ...organization(),
        settings: {
          defaultAppointmentDuration: 30,
          dataProtectionOfficer: null,
          openingHours: storedHours(),
        },
      });
    const values = {
      ...openingHoursValues(organization()),
      monday: { closed: false, periods: [{ start: "08:00", end: "12:00" }] },
    };

    await expect(
      submitOpeningHours(values, { send, t }),
    ).resolves.toMatchObject({ status: "success" });
    expect(send).toHaveBeenCalledWith({
      openingHours: expect.objectContaining({
        monday: { closed: false, periods: [{ start: "08:00", end: "12:00" }] },
      }),
    });

    send.mockRejectedValueOnce(
      Object.assign(new AxiosError("x"), {
        response: {
          data: { message: ["Les périodes sont invalides."] },
          status: 400,
        } as AxiosResponse,
      }),
    );
    await expect(
      submitOpeningHours(values, { send, t }),
    ).resolves.toMatchObject({
      errors: {},
      message: "organization.errors.invalidOpeningHours",
      status: "failed",
    });
  });

  it("lists the six durations the backend accepts", () => {
    expect([...APPOINTMENT_DURATIONS]).toEqual([10, 15, 20, 30, 45, 60]);
  });
});
