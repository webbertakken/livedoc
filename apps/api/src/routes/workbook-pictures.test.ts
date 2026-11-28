// docs/specs/029-sheets/standard-mapping.md "Pictures in the file" (D626): a download reads each image its sheets
// place once, when the document may serve it, in paint order within the 50 MB budget.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PICTURE_FILE_BYTES_MAX } from '@livedoc/sheets/files';
import type { SheetLayout } from '@livedoc/sheets';
import type { Env } from '../types';
import { readWorkbookPictures } from './workbook-pictures';

const sizes =
  vi.fn<
    (
      env: Env,
      d: string,
      ids: readonly string[],
    ) => Promise<Map<string, { byteSize: number; contentType: string }>>
  >();
vi.mock('../db/image-grants', () => ({
  servableImageSizes: (env: Env, d: string, ids: readonly string[]) => sizes(env, d, ids),
}));

const layoutWith = (...imageIds: string[]) =>
  ({
    objects: imageIds.map((imageId, i) => ({
      id: `i${i}`,
      kind: 'image',
      at: { r: 'r', c: 'c', dx: 0, dy: 0 },
      width: 20,
      height: 20,
      imageId,
    })),
  }) as unknown as SheetLayout;

const stored = new Map<string, { bytes: Uint8Array; type?: string }>();
const get = vi.fn(async (id: string) => {
  const s = stored.get(id);
  return s
    ? {
        httpMetadata: s.type ? { contentType: s.type } : {},
        arrayBuffer: async () => s.bytes.buffer,
      }
    : null;
});
const env = { IMAGES: { get } } as unknown as Env;

beforeEach(() => {
  stored.clear();
  get.mockClear();
  sizes.mockReset();
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('readWorkbookPictures', () => {
  it('reads each placed image once, as stored, only when the document may serve it', async () => {
    stored.set('a', { bytes: new Uint8Array([1, 2]), type: 'image/png' });
    stored.set('b', { bytes: new Uint8Array([3]), type: 'image/png' });
    sizes.mockResolvedValue(new Map([['a', { byteSize: 2, contentType: 'image/png' }]]));
    const out = await readWorkbookPictures(env, 'D', [
      { layout: layoutWith('a', 'b') },
      { layout: layoutWith('a') },
    ]);
    expect(sizes).toHaveBeenCalledWith(env, 'D', ['a', 'b']);
    expect([...out]).toEqual([['a', { data: new Uint8Array([1, 2]), type: 'image/png' }]]);
    expect(get).toHaveBeenCalledTimes(1);
    expect(console.info).toHaveBeenCalledWith(
      '[workbook] pictures document=D placed=2 read=1 too_large=0 unavailable=1',
    );
  });

  it('marks every picture from the first past the budget too large, reading none of them', async () => {
    stored.set('a', { bytes: new Uint8Array([1]), type: 'image/png' });
    sizes.mockResolvedValue(
      new Map([
        ['a', { byteSize: 10, contentType: 'image/png' }],
        ['b', { byteSize: PICTURE_FILE_BYTES_MAX, contentType: 'image/jpeg' }],
        ['c', { byteSize: 1, contentType: 'image/gif' }],
      ]),
    );
    const out = await readWorkbookPictures(env, 'D', [{ layout: layoutWith('a', 'b', 'c') }]);
    expect(out.get('b')).toBe('too_large');
    expect(out.get('c')).toBe('too_large');
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('leaves out a type no file holds, and bytes gone from the store', async () => {
    stored.set('svg', { bytes: new Uint8Array([1]), type: 'image/svg+xml' });
    stored.set('typeless', { bytes: new Uint8Array([1]) });
    sizes.mockResolvedValue(
      new Map([
        ['svg', { byteSize: 1, contentType: 'image/svg+xml' }],
        ['typeless', { byteSize: 1, contentType: 'image/png' }],
        ['gone', { byteSize: 1, contentType: 'image/png' }],
      ]),
    );
    const out = await readWorkbookPictures(env, 'D', [
      { layout: layoutWith('svg', 'typeless', 'gone') },
    ]);
    expect(out.size).toBe(0);
  });

  it('asks nothing for a workbook without images, and reads none without an image store', async () => {
    expect(await readWorkbookPictures(env, 'D', [{ layout: layoutWith() }])).toEqual(new Map());
    expect(sizes).not.toHaveBeenCalled();
    const bare = {} as Env;
    expect(await readWorkbookPictures(bare, 'D', [{ layout: layoutWith('a') }])).toEqual(new Map());
    expect(console.warn).toHaveBeenCalledWith(
      '[workbook] pictures unavailable document=D placed=1',
    );
  });
});
