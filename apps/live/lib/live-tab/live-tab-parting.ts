// A live tab's parting copy in This Browser (docs/specs/035-pdf-documents/live-editing-and-storage.md "A page's last
// moment"). A browser does not finish a save begun as its page goes: the record's store is asynchronous. So what a
// browser tab has not saved yet is written, all at once, to the browser's synchronous storage, removed when its save
// lands, and joined to the record by whoever reads the record next. A Yjs update lands once however often it is
// merged, so a copy joined while its writer still lives changes nothing. Where the copies are is
// ./live-tab-parting-keys, which reads none.
import * as Y from 'yjs';
import { base64OfBytes, bytesOfBase64 } from '@livedoc/text-documents/base64';
import { debugLog } from '@/lib/debug-log';
import { partingKey, partingKeys, type PartingStorage } from './live-tab-parting-keys';

/** (default) The most a parting copy may be, as base64: a fifth of the 5 MB a browser gives `localStorage`, which
 *  every other key shares. Safe range: 100,000 to 2,000,000. */
export const LIVE_TAB_PARTING_MAX_CHARS = 1_000_000;

/** The live tab a parting copy is of, and its kind's log tag. */
export type PartingPlace = { documentId: string; tabId: string; tag: string };

/** One browser tab's parting copy of a live tab. */
export type PartingCopy = {
  /** Write what is not saved yet, in place of what this browser tab wrote before. Never throws. */
  write: (update: Uint8Array) => void;
  /** Its save landed. */
  remove: () => void;
};

// The update a copy holds, or null when it is not one: nothing unreadable is ever merged into a record.
function updateOf(text: string | null): Uint8Array | null {
  const bytes = text ? bytesOfBase64(text) : null;
  if (!bytes) return null;
  try {
    Y.decodeUpdate(bytes);
    return bytes;
  } catch {
    return null;
  }
}

/** The parting copy of the browser tab named `writer`: a name of its own unless a test hands one. */
export function partingCopy(
  storage: PartingStorage | null,
  place: PartingPlace,
  writer: string = crypto.randomUUID(),
  maxChars = LIVE_TAB_PARTING_MAX_CHARS,
): PartingCopy {
  const { tag, documentId, tabId } = place;
  const key = partingKey(documentId, tabId, writer);
  const skipped = (reason: 'too_large' | 'refused') =>
    debugLog(`${tag} parting-copy skipped reason=${reason}`, { tabId });
  return {
    write: (update) => {
      if (!storage) return;
      const text = base64OfBytes(update);
      // An earlier copy stays: it still holds what it held, and goes when a save lands.
      if (text.length > maxChars) return skipped('too_large');
      try {
        storage.setItem(key, text);
        debugLog(`${tag} parting-copy written chars=${text.length}`, { tabId });
      } catch {
        skipped('refused');
      }
    },
    remove: () => storage?.removeItem(key),
  };
}

/**
 * Join every parting copy left of a tab to its record through `save`, removing each once saved. One whose save
 * fails stays for the next time; one that cannot be read is removed. Answers how many joined.
 */
export async function joinPartingCopies(
  storage: PartingStorage | null,
  place: PartingPlace,
  save: (update: Uint8Array) => Promise<void>,
): Promise<number> {
  if (!storage) return 0;
  const { tag, documentId, tabId } = place;
  let joined = 0;
  for (const key of partingKeys(storage, documentId, tabId)) {
    const update = updateOf(storage.getItem(key));
    if (!update) {
      storage.removeItem(key);
      debugLog(`${tag} parting-copy unreadable`, { tabId });
      continue;
    }
    try {
      await save(update);
      storage.removeItem(key);
      joined += 1;
    } catch (error) {
      debugLog(`${tag} parting-copy kept error=${String(error)}`, { tabId });
    }
  }
  if (joined > 0) debugLog(`${tag} parting-copy joined count=${joined}`, { tabId });
  return joined;
}
