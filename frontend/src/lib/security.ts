export type PasswordStrengthLevel = "weak" | "medium" | "strong";

export type PasswordStrength = {
  level: PasswordStrengthLevel;
  score: number;
};

// L'authentification finale sera geree cote backend NestJS avec JWT/cookies securises,
// validation serveur, rate limiting et audit logs. Ne jamais stocker de JWT dans localStorage.
export function maskEmail(email: string) {
  const [localPart, domain] = email.trim().split("@");

  if (!localPart || !domain) {
    return "";
  }

  const visibleStart = localPart.slice(0, Math.min(2, localPart.length));
  return `${visibleStart}${"*".repeat(Math.max(localPart.length - visibleStart.length, 2))}@${domain}`;
}

export function sanitizeTextInput(value: string) {
  return value
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function sanitizePhone(value: string) {
  return sanitizeTextInput(value).replace(/[^\d+().\s-]/g, "");
}

export function normalizeEmail(email: string) {
  return sanitizeTextInput(email).toLowerCase();
}

export function getPasswordStrength(password: string): PasswordStrength {
  let score = 0;

  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;

  if (score >= 5) {
    return { level: "strong", score };
  }

  if (score >= 3) {
    return { level: "medium", score };
  }

  return { level: "weak", score };
}
