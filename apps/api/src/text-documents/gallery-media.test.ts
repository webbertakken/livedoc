// docs/specs/034-text-documents/objects.md "Where the bytes live": opening a file stores each picture's media in the
// opener's gallery, once per key; a media the gallery refuses, or a deployment without image storage, keeps its bytes.
import { TextDocument, type Picture } from '@livedoc/text-documents';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../types';

const { storeGalleryImage } = vi.hoisted(() => ({ storeGalleryImage: vi.fn() }));
vi.mock('../gallery-store', async (actual) => ({
  ...(await actual<typeof import('../gallery-store')>()),
  storeGalleryImage,
}));

import { GALLERY_IMPORT_CONCURRENCY, mediaIntoGallery } from './gallery-media';

/** A PNG's first bytes: its signature and header, `width` by `height`. */
const png = (width: number, height: number, tail = 0) =>
  new Uint8Array([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    0,
    0,
    0,
    13,
    0x49,
    0x48,
    0x44,
    0x52,
    0,
    0,
    0,
    width,
    0,
    0,
    0,
    height,
    8,
    2,
    0,
    0,
    0,
    tail,
  ]);

const picture = (media: string): Picture => ({
  type: 'picture',
  media,
  width: 10,
  height: 10,
  props: {},
});

const documentWith = (keys: readonly string[], extraMedia: readonly string[] = []) => {
  const blank = TextDocument.blank({ format: 'odf' });
  return {
    ...blank,
    body: [
      {
        type: 'paragraph' as const,
        style: blank.styles[0]!.id,
        props: {},
        inlines: [...keys, ...keys].map(picture),
      },
    ],
    media: Object.fromEntries(
      [...keys, ...extraMedia].map((key, i) => [
        key,
        { mediaType: 'image/png' as const, bytes: png(4 + i, 3, i), part: `Pictures/${key}.png` },
      ]),
    ),
  };
};

const withImages = { IMAGES: {} } as unknown as Env;

beforeEach(() => {
  storeGalleryImage.mockReset();
});

describe('mediaIntoGallery', () => {
  it('stores each media its pictures hold once, naming the image in its entry', async () => {
    storeGalleryImage.mockImplementation(async (_env, _owner, input: { width: number }) => ({
      ok: true,
      image: { id: `img-${input.width}` },
      deduped: false,
    }));
    const imported = await mediaIntoGallery(
      withImages,
      'owner-1',
      documentWith(['a', 'b'], ['loose']),
    );
    expect(storeGalleryImage).toHaveBeenCalledTimes(2);
    expect(storeGalleryImage.mock.calls[0]!.slice(1)).toEqual([
      'owner-1',
      expect.objectContaining({
        contentType: 'image/png',
        width: 4,
        height: 3,
        originalName: null,
      }),
    ]);
    expect(imported.gallery).toBe(2);
    expect(imported.kept).toEqual({});
    expect(imported.document.media).toMatchObject({
      a: { mediaType: 'image/png', part: 'Pictures/a.png', image: 'img-4' },
      b: { mediaType: 'image/png', part: 'Pictures/b.png', image: 'img-5' },
    });
    expect(imported.document.media?.a?.bytes).toBeUndefined();
  });

  it('keeps the bytes the gallery refuses, counted by reason, and those a failing store could not take', async () => {
    storeGalleryImage
      .mockResolvedValueOnce({
        ok: false,
        error: 'gallery_full',
        reason: 'count',
        limit: 1,
        current: 1,
      })
      .mockRejectedValueOnce(new Error('R2 down'))
      .mockResolvedValueOnce({ ok: true, image: { id: 'img' }, deduped: true });
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const imported = await mediaIntoGallery(withImages, 'o', documentWith(['a', 'b', 'c']));
    expect(imported.kept).toEqual({ gallery_full: 1, store_failed: 1 });
    expect(imported.gallery).toBe(1);
    expect(imported.document.media?.a?.bytes).toBeInstanceOf(Uint8Array);
    expect(imported.document.media?.c).toEqual({
      mediaType: 'image/png',
      part: 'Pictures/c.png',
      image: 'img',
    });
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('[text-document] media-store-failed key=b'),
    );
    error.mockRestore();
  });

  it('keeps every media where the deployment stores no images', async () => {
    const document = documentWith(['a', 'b']);
    const imported = await mediaIntoGallery({} as Env, 'o', document);
    expect(imported).toEqual({ document, gallery: 0, kept: { images_unavailable: 2 } });
    expect(storeGalleryImage).not.toHaveBeenCalled();
  });

  it('stores a few at a time', async () => {
    let live = 0;
    let most = 0;
    storeGalleryImage.mockImplementation(async () => {
      live += 1;
      most = Math.max(most, live);
      await new Promise((resolve) => setTimeout(resolve, 1));
      live -= 1;
      return { ok: true, image: { id: 'x' }, deduped: false };
    });
    const keys = Array.from({ length: GALLERY_IMPORT_CONCURRENCY * 2 + 1 }, (_, i) => `k${i}`);
    const imported = await mediaIntoGallery(withImages, 'o', documentWith(keys));
    expect(imported.gallery).toBe(keys.length);
    expect(most).toBe(GALLERY_IMPORT_CONCURRENCY);
  });

  it('answers a document without pictures as it is', async () => {
    const document = TextDocument.blank({ format: 'ooxml' });
    expect(await mediaIntoGallery(withImages, 'o', document)).toEqual({
      document,
      gallery: 0,
      kept: {},
    });
  });
});
