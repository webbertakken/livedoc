// A custom stamp's picture as the page and the Stamp control draw it (docs/specs/035-pdf-documents/custom-stamps.md
// "Placing one"): its bytes, read once a page by their key, made an address the browser draws; the address held for
// the page, as the pictures are few and small (`PDF_STAMP_MAX_BYTES` each). A read that fails is said once and drawn
// as the stamp's outlined box; a read is never made twice for one key.
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import type { BlobKey } from '@livedoc/document';
import type { StampPicture } from '@livedoc/pdf-documents';
import { debugLog } from '@/lib/debug-log';
import { createListeners } from '@/lib/listeners';

/** A picture's address, or null where it failed; absent while it is on its way. */
export type StampPictureUrl = string | null;

const EMPTY: ReadonlyMap<BlobKey, StampPictureUrl> = new Map();

const MIME = { png: 'image/png', jpeg: 'image/jpeg' } as const;

// Replaced whole as each read settles, so a reader sees a new one.
let urls: ReadonlyMap<BlobKey, StampPictureUrl> = new Map();
const asked = new Set<BlobKey>();
const listeners = createListeners();

const settle = (key: BlobKey, url: StampPictureUrl) => {
  urls = new Map(urls).set(key, url);
  listeners.notify();
};

/** Reads a picture's bytes by `read` unless it was asked already. */
export function askStampPicture(
  picture: Pick<StampPicture, 'key' | 'type'>,
  read: (key: BlobKey) => Promise<Uint8Array<ArrayBuffer>>,
): void {
  if (asked.has(picture.key)) return;
  asked.add(picture.key);
  read(picture.key).then(
    (bytes) =>
      settle(picture.key, URL.createObjectURL(new Blob([bytes], { type: MIME[picture.type] }))),
    (error: unknown) => {
      debugLog(`[pdf] stamp-picture-failed key=${picture.key.slice(0, 8)}`, String(error));
      settle(picture.key, null);
    },
  );
}

/** The addresses of these pictures as they come, each read by `read` once; none read while `read` is null. */
export function useStampPictureUrls(
  pictures: readonly Pick<StampPicture, 'key' | 'type'>[],
  read: ((key: BlobKey) => Promise<Uint8Array<ArrayBuffer>>) | null,
): ReadonlyMap<BlobKey, StampPictureUrl> {
  useEffect(() => {
    if (read) for (const picture of pictures) askStampPicture(picture, read);
  }, [pictures, read]);
  const held = useSyncExternalStore(
    listeners.subscribe,
    () => urls,
    () => EMPTY,
  );
  return useMemo(
    () =>
      new Map(
        pictures.flatMap(({ key }) => {
          const url = held.get(key);
          return url === undefined ? [] : [[key, url] as const];
        }),
      ),
    [pictures, held],
  );
}

/** For tests: forget every picture read. */
export function resetStampPictureUrls(): void {
  for (const url of urls.values()) if (url) URL.revokeObjectURL(url);
  urls = EMPTY;
  asked.clear();
}
