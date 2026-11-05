import { createHash } from 'node:crypto';

/** Fixed namespace for ids derived from import files. Never change it: re-imports rely on it. */
export const IMPORT_ID_NAMESPACE = '4d3a5f0e-8f6b-4c1e-9a57-2b8f2c7e1d90';

/** RFC 9562 UUID version 5 (SHA-1, name-based). */
export function uuidV5(name: string, namespace: string): string {
  const ns = Buffer.from(namespace.replace(/-/g, ''), 'hex');
  if (ns.length !== 16) throw new Error('Invalid namespace UUID');
  const bytes = createHash('sha1').update(ns).update(name, 'utf8').digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export type ImportIdKind =
  | 'exercise'
  | 'folder'
  | 'template'
  | 'template-exercise'
  | 'session'
  | 'session-exercise'
  | 'session-set';

/** Per-user deterministic id: the same file imported twice maps to the same rows. */
export const importId = (userId: string, kind: ImportIdKind, key: string) =>
  uuidV5(`${userId}:${kind}:${key}`, IMPORT_ID_NAMESPACE);
