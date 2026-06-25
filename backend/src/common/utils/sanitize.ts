export function trimInput(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function sanitizeTextInput(value: unknown): string {
  return trimInput(value).replace(/\s+/g, ' ');
}

export function sanitizeString(value: string): string {
  return sanitizeTextInput(value);
}

export function sanitizeStringInput(value: unknown): string {
  return sanitizeTextInput(value);
}

export function normalizeEmail(value: unknown): string {
  return sanitizeTextInput(value).toLowerCase();
}

export function sanitizePhone(value: unknown): string {
  return sanitizeTextInput(value);
}
