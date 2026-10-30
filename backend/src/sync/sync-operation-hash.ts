import { createHash } from 'node:crypto';

import { type SyncOperationDto } from './dto/sync.dto';

/**
 * Stable JSON representation used exclusively for sync idempotency.
 * Object keys are sorted recursively; array order intentionally remains
 * significant because it can express clinical item ordering.
 *
 * It mirrors what a JSON body actually transports:
 * - an object key whose value is `undefined` is omitted, exactly as serde
 *   `skip_serializing_if` and `JSON.stringify` do: the same payload with the
 *   optional key left off and the key set to `undefined` hash identically;
 * - `undefined` array items serialize as JSON `null` (JSON.stringify
 *   semantics), so the array keeps its length and its order;
 * - an explicit `null` stays distinct from an omitted key;
 * - values JSON cannot carry (function, symbol, bigint, NaN, ±Infinity) are
 *   still refused.
 */
export function canonicalizeSyncJson(value: unknown): string {
  if (value === undefined) return 'null';
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
    // Keys set to `undefined` are dropped before sorting: they are absent
    // from the serialized body the hash stands for.
    return `{${Object.keys(record)
      .filter((key) => record[key] !== undefined)
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
