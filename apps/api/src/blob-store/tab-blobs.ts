// A tab may name only bytes the blob store holds (docs/specs/035-pdf-documents/live-editing-and-storage.md "Storage":
// "sent before the tab names them"), so no reader ever opens a tab whose file is not there; and a tab holds the
// bytes it names (docs/specs/006-document/blob-store.md "Holds and retention").
import { pdfTabOf, type BlobKey } from '@livedoc/document';
import { heldBlob } from '../db/blobs';
import { previousVersionHeldUntil, type PreviousStoredFile } from '../pdf-documents/pdf-previous';
import type { Env } from '../types';

export type TabBlobRefusal = 'files_unavailable' | 'blob_missing';

/**
 * Why tabs about to be written cannot be, or null: each PDF tab's stored file must be held for the document's
 * owner at the size the tab names. Tabs of every other kind name no blob and ask nothing.
 */
export async function tabBlobRefusal(
  env: Pick<Env, 'FILES' | 'DB'>,
  ownerId: string,
  tabs: readonly unknown[],
): Promise<TabBlobRefusal | null> {
  for (const tab of tabs) {
    const file = pdfTabOf(tab as { kind?: unknown });
    if (!file) continue;
    if (!env.FILES) {
      console.warn('[blob-store] unavailable document=- key=-');
      return 'files_unavailable';
    }
    if ((await heldBlob(env, ownerId, file.blob))?.size !== file.size) {
      console.warn(
        `[blob-store] refused name=blob_missing document=- key=${file.blob.slice(0, 8)}`,
      );
      return 'blob_missing';
    }
  }
  return null;
}

/** The response a refusal is answered with. */
export const TAB_BLOB_STATUS: Record<TabBlobRefusal, number> = {
  files_unavailable: 503,
  blob_missing: 409,
};

/** A hold: a key, and the day the hold ends; null while the tab names the key. */
export type BlobHold = { readonly key: BlobKey; readonly until: number | null };

/**
 * The keys a tab holds ("Each document tells what it holds"): a PDF tab's stored file, for as long as the tab names
 * it, and each previous version until its day. A key held both ways is held as the tab's own. Null for a tab of a
 * kind that never holds a blob, which tells nothing.
 */
export function tabBlobHolds(
  body: { kind?: unknown; blob?: unknown; size?: unknown },
  previous: readonly PreviousStoredFile[] = [],
): BlobHold[] | null {
  if (body.kind !== 'pdf') return null;
  const holds = new Map<BlobKey, number | null>();
  for (const version of previous) {
    const until = previousVersionHeldUntil(version.replacedAt);
    holds.set(version.blob, Math.max(holds.get(version.blob) ?? 0, until));
  }
  const file = pdfTabOf(body);
  if (file) holds.set(file.blob, null);
  return [...holds].map(([key, until]) => ({ key, until }));
}

/**
 * A PDF tab's body with the stored file its row holds (docs/specs/035-pdf-documents/live-editing-and-storage.md
 * "Replacing the stored file"): a whole-tab save never changes it, whatever it was sent, since only the room's
 * replacement moves the live changes with the file. Any other body is answered as it came.
 */
export function keepStoredFile<Body extends { kind?: unknown; blob?: unknown; size?: unknown }>(
  body: Body,
  stored: { kind?: unknown; blob?: unknown; size?: unknown } | null,
): Body {
  const file = stored ? pdfTabOf(stored) : null;
  if (!file || body.kind !== 'pdf') return body;
  if (body.blob === file.blob && body.size === file.size) return body;
  return { ...body, blob: file.blob, size: file.size };
}
