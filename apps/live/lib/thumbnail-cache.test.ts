// The page-wide thumbnail cache (docs/specs/006-document/document-snapshots.md): bounded, least recently
// used out first, and an evicted picture's blob URL is released.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Appearance } from '@livedoc/document';
import {
  THUMBNAIL_CACHE_HELD_MAX,
  THUMBNAIL_CACHE_MAX,
  holdThumbnail,
  loadThumbnail,
  peekThumbnail,
  forgetThumbnailsOf,
  resetThumbnailCache,
  thumbnailKey,
} from './thumbnail-cache';

const fetchUrl = vi.hoisted(() =>
  vi.fn(async (_owner: string, id: string, opts: { appearance?: string }) => ({
    url: `blob:${id}:${opts.appearance}`,
    backgroundColor: null,
  })),
);
vi.mock('@/lib/api-client', () => ({ apiFetchDocumentThumbnailUrl: fetchUrl }));

const req = (documentId: string, appearance: Appearance = 'light') => ({
  ownerId: 'me',
  documentId,
  version: 1,
  shareCode: null,
  appearance,
});

beforeEach(() => {
  URL.revokeObjectURL = vi.fn();
  resetThumbnailCache();
  // The reset releases the previous case's pictures; each case counts only its own.
  vi.mocked(URL.revokeObjectURL).mockClear();
});

describe('thumbnail cache', () => {
  // docs/specs/035-pdf-documents/live-editing-and-storage.md "A browser's thumbnail": a picture sent by this browser
  // changes a document's thumbnail without the document being saved again.
  it('forgets every picture of one document, releasing those no thumbnail shows', async () => {
    await loadThumbnail(req('pdf'));
    await loadThumbnail(req('pdf', 'dark'));
    await loadThumbnail(req('other'));
    const release = holdThumbnail(thumbnailKey(req('pdf', 'dark')));
    forgetThumbnailsOf('pdf');
    expect(peekThumbnail(thumbnailKey(req('pdf')))).toBeUndefined();
    expect(peekThumbnail(thumbnailKey(req('pdf', 'dark')))).toBeUndefined();
    expect(peekThumbnail(thumbnailKey(req('other')))).toBeDefined();
    // The one a mounted thumbnail shows keeps its pixels.
    expect(vi.mocked(URL.revokeObjectURL).mock.calls).toEqual([['blob:pdf:light']]);
    release();
    await loadThumbnail(req('pdf'));
    expect(fetchUrl).toHaveBeenCalledTimes(4);
  });

  it('forgets that a document had no picture, so the next thumbnail asks again', async () => {
    fetchUrl.mockResolvedValueOnce(null as never);
    await loadThumbnail(req('pdf'));
    expect(peekThumbnail(thumbnailKey(req('pdf')))).toEqual({ status: 'broken' });
    forgetThumbnailsOf('pdf');
    expect(peekThumbnail(thumbnailKey(req('pdf')))).toBeUndefined();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  });

  it('evicts the least recently used picture and releases its blob URL', async () => {
    for (let i = 0; i < THUMBNAIL_CACHE_MAX; i++) await loadThumbnail(req(`d${i}`));
    // Touch the oldest, so the second-oldest is now the one to go.
    await loadThumbnail(req('d0'));
    await loadThumbnail(req('overflow'));
    expect(peekThumbnail(thumbnailKey(req('d0')))).toBeDefined();
    expect(peekThumbnail(thumbnailKey(req('d1')))).toBeUndefined();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:d1:light');
  });

  it('never evicts a picture a mounted thumbnail holds, growing past the bound instead', async () => {
    const releases: (() => void)[] = [];
    for (let i = 0; i < THUMBNAIL_CACHE_MAX + 5; i++) {
      releases.push(holdThumbnail(thumbnailKey(req(`d${i}`))));
      await loadThumbnail(req(`d${i}`));
    }
    expect(peekThumbnail(thumbnailKey(req('d0')))).toBeDefined();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();

    // Unmounted, the oldest go again, down to the bound.
    for (const release of releases.splice(0, 10)) release();
    await loadThumbnail(req('another'));
    expect(peekThumbnail(thumbnailKey(req('d0')))).toBeUndefined();
    expect(peekThumbnail(thumbnailKey(req('d10')))).toBeDefined();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:d0:light');
  });

  it('counts two holders of one picture until both let go', async () => {
    const key = thumbnailKey(req('shared'));
    const first = holdThumbnail(key);
    const second = holdThumbnail(key);
    await loadThumbnail(req('shared'));
    first();
    for (let i = 0; i < THUMBNAIL_CACHE_MAX; i++) await loadThumbnail(req(`d${i}`));
    expect(peekThumbnail(key)).toBeDefined();
    second();
    await loadThumbnail(req('one-more'));
    expect(peekThumbnail(key)).toBeUndefined();
  });

  it('stops growing at its hard bound, held or not', async () => {
    for (let i = 0; i < THUMBNAIL_CACHE_HELD_MAX + 1; i++) {
      holdThumbnail(thumbnailKey(req(`d${i}`)));
      await loadThumbnail(req(`d${i}`));
    }
    expect(peekThumbnail(thumbnailKey(req('d0')))).toBeUndefined();
    expect(peekThumbnail(thumbnailKey(req(`d${THUMBNAIL_CACHE_HELD_MAX}`)))).toBeDefined();
  });

  it('keeps each appearance’s picture apart, asking the api for the half it wants', async () => {
    const light = await loadThumbnail(req('d1', 'light'));
    const dark = await loadThumbnail(req('d1', 'dark'));
    expect(thumbnailKey(req('d1', 'light'))).not.toBe(thumbnailKey(req('d1', 'dark')));
    expect(light).toMatchObject({ status: 'ready', src: 'blob:d1:light' });
    expect(dark).toMatchObject({ status: 'ready', src: 'blob:d1:dark' });
    expect(fetchUrl).toHaveBeenLastCalledWith('me', 'd1', {
      version: 1,
      shareCode: null,
      appearance: 'dark',
    });
  });
});
