// docs/specs/029-sheets/standard-mapping.md "Pictures in the file", "Stored on opening" (D628): a read picture is
// placed by its sheet's row and column ids after the sheet's objects; one anchored past the grid, or past the sheet's
// 100 objects, is left out and named; the same bytes are stored once.
import { describe, expect, it } from 'vitest';
import { emptyLayout } from '../sheet';
import { SHEET_OBJECTS_MAX } from '../objects/sheet-objects';
import type { SheetImage } from '../objects/sheet-image';
import { picturesPlaced, picturesToPlace, type PictureStored } from './import-pictures';
import type { ReadPicture } from './file-pictures';
import type { FileLoss, SheetFromFile } from './workbook-file';

let n = 3;
const rand = () => (n = (n * 16807) % 2147483647) / 2147483647;

const BYTES = new Uint8Array([1, 2, 3]);
const picture = (r: number, c: number, alt?: string): ReadPicture => ({
  at: { r, c, dx: 2, dy: 3 },
  width: 60,
  height: 30,
  bytes: BYTES,
  type: 'image/png',
  natural: { width: 120, height: 60 },
  ...(alt ? { alt } : {}),
});

describe('picturesToPlace', () => {
  it('places each picture by its cell’s ids with its natural size and alt text', () => {
    const layout = emptyLayout(rand, 3, 3);
    const losses: FileLoss[] = [];
    const [placed] = picturesToPlace(
      { id: 's1', title: 'Data', layout },
      [picture(2, 1, 'Logo')],
      rand,
      losses,
    );
    expect(placed).toMatchObject({
      sheetId: 's1',
      image: {
        kind: 'image',
        at: { r: layout.rows[2], c: layout.cols[1], dx: 2, dy: 3 },
        width: 60,
        height: 30,
        naturalWidth: 120,
        naturalHeight: 60,
        alt: 'Logo',
      },
      type: 'image/png',
    });
    expect(losses).toEqual([]);
  });

  it('names a picture anchored past the grid, and those past the sheet’s objects', () => {
    const layout = emptyLayout(rand, 2, 2);
    const chart = { id: 'c', kind: 'chart' } as unknown as SheetImage;
    const full = { ...layout, objects: Array.from({ length: SHEET_OBJECTS_MAX - 1 }, () => chart) };
    const losses: FileLoss[] = [];
    const placed = picturesToPlace(
      { id: 's1', title: 'Data', layout: full },
      [picture(5, 0), picture(0, 0), picture(1, 1)],
      rand,
      losses,
    );
    expect(placed).toHaveLength(1);
    expect(losses).toEqual([
      { k: 'picture_unread', sheet: 'Data', why: 'cut' },
      { k: 'picture_unread', sheet: 'Data', why: 'objects_full' },
    ]);
  });

  it('places none for a sheet without pictures', () => {
    expect(
      picturesToPlace(
        { id: 's', title: 'S', layout: emptyLayout(rand, 1, 1) },
        undefined,
        rand,
        [],
      ),
    ).toEqual([]);
  });
});

describe('picturesPlaced', () => {
  const sheet = (id: string): SheetFromFile => ({
    id,
    title: id,
    layout: emptyLayout(rand, 2, 2),
    cells: [],
  });

  it('stores the same bytes once and leaves untouched a sheet with no picture', async () => {
    const sheets = [sheet('a'), sheet('b')];
    const losses: FileLoss[] = [];
    const toPlace = [...picturesToPlace(sheets[0]!, [picture(0, 0), picture(1, 1)], rand, losses)];
    let calls = 0;
    const store = async (): Promise<PictureStored> => {
      calls += 1;
      return { ok: true, imageId: 'g1' };
    };
    const out = await picturesPlaced(sheets, toPlace, store, losses);
    expect(calls).toBe(1);
    expect(out).toMatchObject({ placed: 2, left: 0 });
    expect(out.sheets[0]!.layout.objects!.map((o) => (o as SheetImage).imageId)).toEqual([
      'g1',
      'g1',
    ]);
    expect(out.sheets[1]).toBe(sheets[1]);
  });
});
