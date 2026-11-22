import type { Appearance } from '@livedoc/document';
import { apiFetchDocumentThumbnailUrl } from '@/lib/api-client';

// In-memory cache of document snapshot thumbnails (docs/specs/006-document/document-snapshots.md), shared
// by every DocumentThumbnail on the page.
//
// Without it each thumbnail owned its blob URL and revoked it on unmount,
// so switching Explorer views, folders or routes threw every preview away
// and the next mount went back to the network (at best the browser's HTTP
// cache) and re-decoded it, showing the loader in between. Keyed by the
// same inputs the thumbnail fetches for (viewer, document, version, share
// code, appearance), so an edited document's new `savedAt` is a new key and never
// reads the old picture, and a switch of appearance asks for the other half.
//
// A "no snapshot" answer is cached too: it is version-keyed like the
// picture, so it cannot change until the document does. A thrown fetch
// (network error) is not, so the next mount retries it.

export type ThumbnailEntry =
  { status: 'ready'; src: string; backgroundColor: string | null } | { status: 'broken' };

export type ThumbnailRequest = {
  ownerId: string;
  documentId: string;
  version: number;
  shareCode: string | null;
  // The viewer's, so the picture is the tab as they see it (document-snapshots.md "In the viewer's half").
  appearance: Appearance;
};

// Enough for a full Explorer grid, its folder mosaics and a Timeline feed,
// while bounding the blob URLs held: each is a few KB to a few hundred KB
// of SVG text. Evicted least recently used.
export const THUMBNAIL_CACHE_MAX = 200;

// A mounted thumbnail holds its entry (holdThumbnail), and a held entry is never the one evicted: evicting a
// picture still on screen made its box ask for it again, which evicted another, a fetch loop with more than
// THUMBNAIL_CACHE_MAX previews mounted. The cache grows to the number held instead, up to this hard bound (a
// Details view of a large library), past which the oldest go whether held or not.
export const THUMBNAIL_CACHE_HELD_MAX = 1_000;

const entries = new Map<string, ThumbnailEntry>();
const inflight = new Map<string, Promise<ThumbnailEntry>>();
// How many mounted thumbnails hold each key.
const holds = new Map<string, number>();

/** Holds `key`'s entry while a thumbnail showing it is mounted; answers the release. */
export function holdThumbnail(key: string): () => void {
  holds.set(key, (holds.get(key) ?? 0) + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const left = (holds.get(key) ?? 1) - 1;
    if (left > 0) holds.set(key, left);
    else holds.delete(key);
    trim();
  };
}

export function thumbnailKey(req: ThumbnailRequest): string {
  return JSON.stringify([req.ownerId, req.documentId, req.version, req.shareCode, req.appearance]);
}

// A settled entry, if there is one. Pure (no recency bump), so a render
// can call it.
export function peekThumbnail(key: string): ThumbnailEntry | undefined {
  return entries.get(key);
}

// The entry for `req`, fetching it at most once however many thumbnails
// ask at the same time (a document in both Recent and a folder mosaic).
export function loadThumbnail(req: ThumbnailRequest): Promise<ThumbnailEntry> {
  const key = thumbnailKey(req);
  const hit = entries.get(key);
  if (hit) {
    remember(key, hit);
    return Promise.resolve(hit);
  }
  const pending = inflight.get(key);
  if (pending) return pending;
  const request = apiFetchDocumentThumbnailUrl(req.ownerId, req.documentId, {
    version: req.version,
    shareCode: req.shareCode,
    appearance: req.appearance,
  })
    .then((result): ThumbnailEntry => {
      const entry: ThumbnailEntry = result
        ? { status: 'ready', src: result.url, backgroundColor: result.backgroundColor }
        : { status: 'broken' };
      remember(key, entry);
      return entry;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, request);
  return request;
}

function remember(key: string, entry: ThumbnailEntry) {
  entries.delete(key);
  entries.set(key, entry);
  trim();
}

/**
 * Forget every settled entry of a document: its picture changed without the document being saved again (a PDF's
 * first page sent by this browser, docs/specs/035-pdf-documents/live-editing-and-storage.md "A browser's thumbnail").
 * A thumbnail mounted now keeps what it shows; the next to mount asks again.
 */
export function forgetThumbnailsOf(documentId: string): void {
  for (const [key, entry] of [...entries]) {
    if ((JSON.parse(key) as unknown[])[1] !== documentId) continue;
    entries.delete(key);
    if (entry.status === 'ready' && !holds.has(key)) URL.revokeObjectURL(entry.src);
  }
}

// Least recently used out first, skipping held entries while under the hard bound.
function trim() {
  const bound = Math.min(THUMBNAIL_CACHE_HELD_MAX, Math.max(THUMBNAIL_CACHE_MAX, holds.size));
  while (entries.size > bound) {
    let victim: string | undefined;
    for (const candidate of entries.keys()) {
      if (!holds.has(candidate)) {
        victim = candidate;
        break;
      }
    }
    victim ??= entries.keys().next().value!;
    const evicted = entries.get(victim)!;
    entries.delete(victim);
    // An <img> that already decoded this URL keeps its pixels; only a
    // fresh mount would miss it, and that mount refetches.
    if (evicted.status === 'ready') URL.revokeObjectURL(evicted.src);
  }
}

// Tests only: start each case from an empty cache.
export function resetThumbnailCache() {
  for (const entry of entries.values()) {
    if (entry.status === 'ready') URL.revokeObjectURL(entry.src);
  }
  entries.clear();
  inflight.clear();
  holds.clear();
}
