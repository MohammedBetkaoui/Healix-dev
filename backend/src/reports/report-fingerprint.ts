import { createHash } from 'node:crypto';

// Same canonical form as the prescriptions: keys sorted, dates as ISO strings,
// so the same content always gives the same fingerprint.
export const canonicalize = (value: unknown): unknown => {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
};

export const fingerprint = (value: unknown) =>
  createHash('sha256')
    .update(JSON.stringify(canonicalize(value)))
    .digest('hex');

/** What a finalized report is made of: any change to it changes the fingerprint. */
export function reportContent(input: {
  number: string;
  version: number;
  replacesNumber: string | null;
  category: string;
  title: string;
  effectiveAt: Date;
  patient: unknown;
  author: unknown;
  organization: unknown;
  sections: unknown;
  conclusion: string | null;
}) {
  return input;
}
