import { type TeamMember } from "../types/team.types";

const normalize = (value: string) =>
  value.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase().trim();

export function filterTeamMembers(
  members: readonly TeamMember[],
  filters: {
    search: string;
    role: string;
    status: string;
    scope: "FULL" | "BASIC";
  },
) {
  const search = normalize(filters.search);
  return members.filter((member) => {
    if (filters.role && member.role !== filters.role) return false;
    if (filters.status && member.accountStatus !== filters.status) return false;
    // BASIC readers must not be able to infer hidden email addresses by search.
    const searchable = [
      member.fullName,
      member.doctor?.speciality,
      member.doctor?.wilaya,
    ];
    if (filters.scope === "FULL") searchable.push(member.email ?? "");
    return normalize(searchable.filter(Boolean).join(" ")).includes(search);
  });
}
