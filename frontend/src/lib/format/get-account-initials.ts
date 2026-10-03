// Initials for the dashboard user avatar: first letter of the first two words
// of the account's full name ("Clinique El Shifa" → "CE"). Falls back to "H"
// (HealixDZ) while /auth/me is loading or when the name is empty.
export function getAccountInitials(fullName: string | null | undefined, fallback = "H") {
  return (
    fullName
      ?.split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("") || fallback
  );
}
