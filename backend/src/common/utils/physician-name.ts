import { UserRole } from '../enums/user-role.enum';

// A title typed into the name itself: "Dr Amel…", "Dr. Amel…", "Docteur
// Amel…", or "د. أمال…" as the Arabic sign-up form suggests. Followed by a dot
// or a space, so that "Driss" keeps its first letters.
const TYPED_TITLE = /^(?:(?:docteure?|dr)(?:\.\s*|\s+)|د\.\s*)/iu;

export function isPhysicianRole(role: string): boolean {
  return (
    role === UserRole.INDEPENDENT_DOCTOR || role === UserRole.AFFILIATED_DOCTOR
  );
}

/** "Dr <name>", never "Dr Dr <name>" when the name was typed with a title. */
export function formatPhysicianName(fullName: string): string {
  let name = fullName.trim();

  for (;;) {
    const untitled = name.replace(TYPED_TITLE, '').trim();
    if (untitled === name || !untitled) break;
    name = untitled;
  }

  return `Dr ${name}`;
}
