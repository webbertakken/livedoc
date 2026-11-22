// The local Trash (docs/specs/013-workspace/trash.md, "The local Trash"): an
// Offline Mode document lives only in this browser, so its Trash does too.
// Deleting one stamps `trashedAt` on its IndexedDB record; the record keeps
// everything else. The 30-day rule is the api's, applied whenever the app
// lists documents instead of by a cron.

import { isTrashExpired, trashPurgeDueAt, type TrashedDocument } from '@livedoc/api-schema';
import { pdfTabOf } from '@livedoc/document';
import {
  offlineBackend,
  offlineDeleteDocument,
  offlineUpdateRecord,
  serializeOfflineWrite,
  type OfflineDocumentRecord,
} from './offline-store';
import { debugLog } from '@/lib/debug-log';

function trashRow(rec: OfflineDocumentRecord & { trashedAt: number }): TrashedDocument {
  return {
    id: rec.id,
    name: rec.name,
    teamId: null,
    teamName: null,
    trashedAt: rec.trashedAt,
    purgeAt: trashPurgeDueAt(rec.trashedAt),
    // Only the server's clean-up moves empty documents; a local row was deleted.
    reason: 'deleted',
  };
}

function isTrashed(
  rec: OfflineDocumentRecord | undefined,
): rec is OfflineDocumentRecord & { trashedAt: number } {
  return rec?.trashedAt !== undefined;
}

// Move a live record to the local Trash. The first deletion time stands.
export async function offlineTrashDocument(id: string, now: number): Promise<void> {
  await serializeOfflineWrite(() =>
    offlineUpdateRecord(id, (rec) =>
      !rec || isTrashed(rec) ? undefined : { ...rec, trashedAt: now },
    ),
  );
}

// Bring a trashed record back exactly as it was: folder, star, deck. False
// when it isn't in the local Trash.
export async function offlineRestoreDocument(id: string): Promise<boolean> {
  return serializeOfflineWrite(async () => {
    let restored = false;
    await offlineUpdateRecord(id, (rec) => {
      if (!isTrashed(rec)) return undefined;
      const { trashedAt: _trashedAt, ...live } = rec;
      restored = true;
      return live;
    });
    return restored;
  });
}

// A purge takes the record's file bytes with it (docs/specs/013-workspace/trash.md "The local Trash"): each key of
// a PDF tab that no other document here names is forgotten from this browser's blob store. Only a record with a PDF
// tab loads the store. A store that will not forget leaves bytes nothing names, which signing out or the cache's
// limit takes; the purge itself stands.
async function purgeRecord(rec: OfflineDocumentRecord): Promise<void> {
  await offlineDeleteDocument(rec.id);
  const keys = rec.tabs.flatMap((tab) => pdfTabOf(tab)?.blob ?? []);
  if (keys.length === 0) return;
  try {
    const { thisBrowserBlobs } = await import('./offline-blobs');
    await thisBrowserBlobs().forgetUnnamed(keys);
  } catch (error) {
    debugLog('[trash] purged local, bytes kept', String(error));
  }
}

// Delete a trashed record for good. Never a live one: the local Trash can't
// be skipped by naming an id.
export async function offlinePurgeDocument(id: string): Promise<boolean> {
  const rec = await offlineBackend().get(id);
  if (!isTrashed(rec)) return false;
  await purgeRecord(rec);
  return true;
}

// Newest first, as rows of the same shape the api's Trash returns.
export async function offlineListTrash(): Promise<TrashedDocument[]> {
  const recs = await offlineBackend().all();
  return recs
    .filter(isTrashed)
    .map(trashRow)
    .sort((a, b) => b.trashedAt - a.trashedAt);
}

// Purge every record 30 days in the local Trash. Returns how many went.
export async function offlinePurgeExpiredTrash(now: number): Promise<number> {
  const expired = (await offlineBackend().all()).filter(
    (r) => isTrashed(r) && isTrashExpired(r.trashedAt, now),
  );
  for (const rec of expired) await purgeRecord(rec);
  if (expired.length > 0) debugLog('[trash] purged local', expired.length);
  return expired.length;
}
