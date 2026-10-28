import { type TeamMember } from "../types/team.types";
import { filterTeamMembers } from "./filter-team-members";

const members: TeamMember[] = [
  {
    membershipId: "doctor",
    userId: "u1",
    fullName: "Dr Amel Benaïssa",
    email: "private-contact@example.invalid",
    role: "DOCTOR",
    accountStatus: "ACTIVE",
    isEmailVerified: true,
    joinedAt: "2026-10-01T09:00:00Z",
    doctor: {
      id: "d1",
      speciality: "Médecine générale",
      wilaya: "Alger",
      verificationStatus: "VERIFIED",
    },
  },
  {
    membershipId: "admin",
    userId: "u2",
    fullName: "Nadia Hamidi",
    email: null,
    role: "ADMIN",
    accountStatus: "SUSPENDED",
    isEmailVerified: true,
    joinedAt: "2026-10-01T09:00:00Z",
    doctor: null,
  },
  {
    membershipId: "reception",
    userId: "u3",
    fullName: "ليلى منصوري",
    email: null,
    role: "RECEPTIONIST",
    accountStatus: "ACTIVE",
    isEmailVerified: true,
    joinedAt: "2026-10-01T09:00:00Z",
    doctor: null,
  },
];
const filters = { search: "", role: "", status: "", scope: "FULL" as const };

it.each([" BENAIssa ", "medecine generale", "alger"])(
  "finds a clinician by name, specialty or location: %s",
  (search) => {
    expect(
      filterTeamMembers(members, { ...filters, search }).map(
        (member) => member.membershipId,
      ),
    ).toEqual(["doctor"]);
  },
);

it("combines the search with both filters", () => {
  expect(
    filterTeamMembers(members, {
      ...filters,
      search: "Nadia",
      role: "ADMIN",
      status: "SUSPENDED",
    }),
  ).toEqual([members[1]]);
  expect(
    filterTeamMembers(members, {
      ...filters,
      search: "Nadia",
      role: "ADMIN",
      status: "ACTIVE",
    }),
  ).toEqual([]);
});

it("supports Arabic names and the reception role", () => {
  expect(
    filterTeamMembers(members, {
      ...filters,
      search: "ليلى",
      role: "RECEPTIONIST",
    }),
  ).toEqual([members[2]]);
});

it("never matches hidden email addresses in BASIC scope", () => {
  expect(
    filterTeamMembers(members, {
      ...filters,
      search: "private-contact",
      scope: "BASIC",
    }),
  ).toEqual([]);
  expect(
    filterTeamMembers(members, { ...filters, search: "private-contact" }),
  ).toEqual([members[0]]);
});

it("restores the complete directory when filters are cleared, preserving its order", () => {
  expect(filterTeamMembers(members, filters)).toEqual(members);
  expect(filterTeamMembers([], filters)).toEqual([]);
});
