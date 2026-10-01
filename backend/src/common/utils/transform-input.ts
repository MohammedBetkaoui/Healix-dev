type TransformValue = {
  value: unknown;
};

export function trimStringValue({ value }: TransformValue): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export function removeStringWhitespace({ value }: TransformValue): unknown {
  return typeof value === 'string' ? value.replace(/\s+/g, '') : value;
}

export function normalizeStringWhitespace({ value }: TransformValue): unknown {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value;
}
