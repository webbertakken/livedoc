// A room taking over its legacy room's state (docs/specs/006-document/document-storage-move.md "Handing over room
// state"). The key-value room each document had before keeps the order state, the
// collaboration ledger, the live poll, the baton, selections and agent presence; the new SQLite room takes every key
// verbatim on its first request, then marks the handover so it never asks again.

import type { LegacyStatePage } from './legacy-document-room';

/** The room's key-value marker: present once its legacy state is taken. */
export const LEGACY_HANDOVER_KEY = 'legacy-handover';
/** Keys one key-value `put` accepts. */
export const HANDOVER_PUT_KEYS = 128;

export type HandoverStorage = {
  get<T>(key: string): Promise<T | undefined>;
  put(entries: Record<string, unknown>): Promise<void>;
};

export type LegacySource = {
  exportState(cursor: string | null): Promise<LegacyStatePage>;
  clear(): Promise<void>;
};

/**
 * Take every key the legacy room stores, then write the marker; answers how many keys were taken, or null when the
 * room had taken them already. A throw leaves no marker, so the next request tries again; keys already put are put
 * again verbatim by that retry.
 */
export async function takeLegacyState(
  storage: HandoverStorage,
  legacy: LegacySource,
  now: number,
): Promise<number | null> {
  if ((await storage.get(LEGACY_HANDOVER_KEY)) !== undefined) return null;
  let taken = 0;
  let cursor: string | null = null;
  do {
    const page: LegacyStatePage = await legacy.exportState(cursor);
    for (let i = 0; i < page.entries.length; i += HANDOVER_PUT_KEYS) {
      await storage.put(Object.fromEntries(page.entries.slice(i, i + HANDOVER_PUT_KEYS)));
    }
    taken += page.entries.length;
    cursor = page.next;
  } while (cursor !== null);
  await storage.put({ [LEGACY_HANDOVER_KEY]: { at: now, keys: taken } });
  return taken;
}
