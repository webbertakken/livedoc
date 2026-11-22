// docs/specs/009-elements/images.md "Size cap", "Dedupe": storing one image in an owner's gallery, wherever its bytes
// come from; and docs/specs/034-text-documents/objects.md "Where the bytes live": a file's pictures meet the same checks.
import { sha256Hex } from '@livedoc/api-schema';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from './types';

const { db } = vi.hoisted(() => ({
  db: { findImageBySha: vi.fn(), imageTotalsByOwner: vi.fn(), insertImage: vi.fn() },
}));
vi.mock('./db', () => db);

import { galleryFull, galleryRoom, hasImageStore, storeGalleryImage } from './gallery-store';
import { MAX_IMAGE_BYTES } from './limits';

const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 1, 2, 3, 4,
]);

const bucket = () => ({ put: vi.fn(), delete: vi.fn(), get: vi.fn() });
const envOf = (images = bucket(), vars: Record<string, string> = {}) =>
  ({ IMAGES: images, ...vars }) as unknown as Env & { IMAGES: R2Bucket };
const input = (bytes: Uint8Array = PNG, contentType = 'image/png') => ({
  bytes: bytes.slice().buffer,
  contentType,
  width: 4,
  height: 4,
  originalName: 'a.png',
});

beforeEach(() => {
  for (const fn of Object.values(db)) fn.mockReset();
});

describe('storeGalleryImage', () => {
  it('puts the bytes, then the row, and answers the new image', async () => {
    db.findImageBySha.mockResolvedValue(null);
    db.insertImage.mockResolvedValue({ id: 'new' });
    const images = bucket();
    const stored = await storeGalleryImage(envOf(images), 'owner-1', input());
    expect(stored).toEqual({ ok: true, image: { id: 'new' }, deduped: false });
    const [id, , options] = images.put.mock.calls[0]! as [string, unknown, R2PutOptions];
    expect(options).toEqual({
      httpMetadata: { contentType: 'image/png' },
      customMetadata: { ownerId: 'owner-1', originalName: 'a.png' },
    });
    expect(db.insertImage.mock.calls[0]![1]).toMatchObject({
      id,
      ownerId: 'owner-1',
      contentType: 'image/png',
      byteSize: PNG.byteLength,
      sha256: await sha256Hex(PNG.slice().buffer),
    });
  });

  it('answers the image the owner holds of the same bytes, writing nothing', async () => {
    db.findImageBySha.mockResolvedValue({ id: 'held' });
    const images = bucket();
    const stored = await storeGalleryImage(envOf(images), 'owner-1', input());
    expect(stored).toEqual({ ok: true, image: { id: 'held' }, deduped: true });
    expect(images.put).not.toHaveBeenCalled();
    expect(db.findImageBySha).toHaveBeenCalledWith(
      expect.anything(),
      'owner-1',
      await sha256Hex(PNG.slice().buffer),
    );
  });

  it('refuses bytes that are not the type declared', async () => {
    const stored = await storeGalleryImage(envOf(), 'owner-1', input(PNG, 'image/jpeg'));
    expect(stored).toEqual({ ok: false, error: 'unsupported_type' });
    const text = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>');
    expect(await storeGalleryImage(envOf(), 'owner-1', input(text, 'image/png'))).toEqual({
      ok: false,
      error: 'unsupported_type',
    });
  });

  it('refuses bytes past the most an image holds', async () => {
    const big = new Uint8Array(MAX_IMAGE_BYTES + 1);
    big.set(PNG);
    expect(await storeGalleryImage(envOf(), 'owner-1', input(big))).toEqual({
      ok: false,
      error: 'file_too_large',
      limitBytes: MAX_IMAGE_BYTES,
    });
  });

  it('refuses a malformed JPEG rather than keep what it would leak', async () => {
    db.findImageBySha.mockResolvedValue(null);
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const images = bucket();
    expect(await storeGalleryImage(envOf(images), 'owner-1', input(jpeg, 'image/jpeg'))).toEqual({
      ok: false,
      error: 'malformed_jpeg',
    });
    expect(images.put).not.toHaveBeenCalled();
  });

  it('names the cap a racing upload filled, deleting its own bytes', async () => {
    db.findImageBySha.mockResolvedValue(null);
    db.insertImage.mockResolvedValue(null);
    db.imageTotalsByOwner.mockResolvedValue({ count: 3, bytes: 0 });
    const images = bucket();
    const stored = await storeGalleryImage(
      envOf(images, { IMAGE_MAX_PER_OWNER: '3' }),
      'o',
      input(),
    );
    expect(stored).toEqual({
      ok: false,
      error: 'gallery_full',
      reason: 'count',
      limit: 3,
      current: 3,
    });
    expect(db.insertImage.mock.calls[0]![2]).toEqual({ maxImages: 3, maxBytes: null });
    expect(images.delete).toHaveBeenCalledWith(images.put.mock.calls[0]![0]);
  });

  it('answers a conflict when the gallery has room again after a refused insert', async () => {
    db.findImageBySha.mockResolvedValue(null);
    db.insertImage.mockResolvedValue(null);
    db.imageTotalsByOwner.mockResolvedValue({ count: 1, bytes: 0 });
    const stored = await storeGalleryImage(
      envOf(bucket(), { IMAGE_MAX_PER_OWNER: '3' }),
      'o',
      input(),
    );
    expect(stored).toEqual({ ok: false, error: 'upload_conflict' });
  });

  it('answers the winner of a race on the same bytes, as a dedupe', async () => {
    db.findImageBySha.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'winner' });
    db.insertImage.mockResolvedValue(null);
    const images = bucket();
    const stored = await storeGalleryImage(envOf(images), 'o', input());
    expect(stored).toEqual({ ok: true, image: { id: 'winner' }, deduped: true });
    expect(images.delete).toHaveBeenCalledWith(images.put.mock.calls[0]![0]);
  });
});

describe('galleryRoom', () => {
  it('asks nothing of a deployment without caps', async () => {
    expect(await galleryRoom(envOf(), 'o', 10)).toBeNull();
    expect(db.imageTotalsByOwner).not.toHaveBeenCalled();
  });

  it('names the byte cap an upload would cross', async () => {
    db.imageTotalsByOwner.mockResolvedValue({ count: 1, bytes: 995 });
    expect(
      await galleryRoom(envOf(bucket(), { IMAGE_MAX_BYTES_PER_OWNER: '1000' }), 'o', 10),
    ).toEqual({ error: 'gallery_full', reason: 'bytes', limit: 1000, current: 995 });
  });
});

describe('galleryFull', () => {
  it('fits an upload exactly at the byte cap', () => {
    expect(galleryFull({ maxImages: null, maxBytes: 100 }, { count: 0, bytes: 90 }, 10)).toBeNull();
  });
});

describe('hasImageStore', () => {
  it('is false without the binding', () => {
    expect(hasImageStore({ IMAGES: undefined } as unknown as Env)).toBe(false);
    expect(hasImageStore(envOf())).toBe(true);
  });
});
