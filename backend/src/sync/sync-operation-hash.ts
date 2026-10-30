import { createHash } from 'node:crypto';

import { type SyncOperationDto } from './dto/sync.dto';

/**
 * Stable JSON representation used exclusively for sync idempotency.
 * Object keys are sorted recursively; array order intentionally remains
 * significant because it can express clinical item ordering.
 */
export function canonicalizeSyncJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Invalid JSON number');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalizeSyncJson).join(',')}]`;
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalizeSyncJson(record[key])}`)
      .join(',')}}`;
  }
  throw new TypeError('Sync operation contains a non-JSON value');
}

/**
 * `occurredAt` is deliberately excluded: it is transport metadata, not the
 * clinical mutation. The same retry must retain the same semantic hash.
 */
export function computeSyncOperationHash(operation: SyncOperationDto): string {
  const canonical = canonicalizeSyncJson({
    entityType: operation.entityType,
    localEntityId: operation.localEntityId,
    operation: operation.operation,
    baseVersion: operation.baseVersion ?? null,
    payload: operation.payload,
  });
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}
