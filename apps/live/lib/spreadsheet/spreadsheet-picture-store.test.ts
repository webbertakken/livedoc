// docs/specs/029-sheets/standard-mapping.md "Pictures in the file", "Stored on opening" (D628): a file's picture goes
// through the import image pipeline into the opener's gallery, its failure named as the read names a picture left out.
import { describe, expect, it, vi } from 'vitest';
import type { ImportImageSession } from '@/lib/import-images';
import { pictureStoredOf, spreadsheetPictureStore } from './spreadsheet-picture-store';

describe('pictureStoredOf', () => {
  it('takes the stored image id', () => {
    expect(
      pictureStoredOf({ ok: true, imageId: 'g1', width: 2, height: 2, kind: 'deduped' }),
    ).toEqual({
      ok: true,
      imageId: 'g1',
    });
  });

  it.each([
    ['missing-bytes', 'unreadable'],
    ['unsupported', 'unreadable'],
    ['too-large', 'too_large'],
    ['gallery-full', 'gallery_full'],
    ['images-unavailable', 'unavailable'],
    ['offline-budget', 'failed'],
    ['upload-failed', 'failed'],
  ] as const)('names %s as %s', (failure, why) => {
    expect(pictureStoredOf({ ok: false, failure })).toEqual({ ok: false, why });
  });
});

const natural = { width: 1, height: 1 };

describe('spreadsheetPictureStore', () => {
  it('opens one session at the first picture and hands it each picture as a typed blob', async () => {
    const seen: Blob[] = [];
    const session: ImportImageSession = {
      store: async (source) => {
        if (source.kind === 'blob') seen.push(source.blob);
        return { ok: true, imageId: `g${seen.length}`, width: 1, height: 1, kind: 'uploaded' };
      },
    };
    const open = vi.fn(async () => session);
    const store = spreadsheetPictureStore(open);
    expect(open).not.toHaveBeenCalled();
    expect(await store({ data: new Uint8Array([1, 2]), type: 'image/png', natural })).toEqual({
      ok: true,
      imageId: 'g1',
    });
    expect(await store({ data: new Uint8Array([3]), type: 'image/gif', natural })).toEqual({
      ok: true,
      imageId: 'g2',
    });
    expect(open).toHaveBeenCalledTimes(1);
    expect(seen.map((b) => [b.type, b.size])).toEqual([
      ['image/png', 2],
      ['image/gif', 1],
    ]);
  });
});
