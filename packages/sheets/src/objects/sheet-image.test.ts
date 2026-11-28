// An image over cells (docs/specs/029-sheets/inserted-objects.md "Images over cells", D623): what one may be, the
// layout write that sets it, what deleting rows and columns does to its anchor, and the gallery images a sheet places.
import { describe, expect, it } from 'vitest';
import { applySheetWrite, type SheetWrite } from '../store';
import { validateWrite } from '../validate';
import { makeSheets } from '../testing/book';
import type { Sheet } from '../sheet';
import { isSheetObject, type SheetObject } from './sheet-objects';
import {
  SHEET_IMAGE_ALT_MAX,
  SHEET_IMAGE_SIZE,
  sheetImageIds,
  type SheetImage,
  fittedImageSize,
} from './sheet-image';

const by = { id: 'p', name: 'P', color: '#000000' };
const R = (i: number) => `s0r${i}`;
const C = (i: number) => `s0c${i}`;
const image = (x: Partial<SheetImage> = {}): SheetImage => ({
  id: 'image01',
  kind: 'image',
  at: { r: R(1), c: C(2), dx: 4, dy: 8 },
  width: 300,
  height: 200,
  imageId: 'img_abc',
  ...x,
});
const set = (o: SheetObject | null, id = o?.id ?? 'image01'): SheetWrite => ({
  kind: 'layout',
  changes: [{ k: 'object', id, object: o }],
});

describe('what an image over cells may be', () => {
  it('takes its anchor, size, gallery image, natural size and alt text', () => {
    expect(isSheetObject(image(), 'image01')).toBe(true);
    expect(
      isSheetObject(image({ naturalWidth: 1200, naturalHeight: 800, alt: 'A cat' }), 'image01'),
    ).toBe(true);
    expect(
      isSheetObject(
        image({ width: SHEET_IMAGE_SIZE.min, height: SHEET_IMAGE_SIZE.max }),
        'image01',
      ),
    ).toBe(true);
  });

  it('refuses unknown keys, sizes past its bounds, a data URI or no image, and long alt text', () => {
    for (const bad of [
      { ...image(), extra: 1 },
      image({ width: SHEET_IMAGE_SIZE.min - 1 }),
      image({ height: SHEET_IMAGE_SIZE.max + 1 }),
      image({ imageId: '' }),
      image({ imageId: 'data:image/png;base64,AAAA' }),
      image({ imageId: 'x'.repeat(129) }),
      image({ naturalWidth: 0 }),
      image({ naturalHeight: -1 }),
      image({ alt: 'x'.repeat(SHEET_IMAGE_ALT_MAX + 1) }),
      image({ at: { r: R(1), c: C(2), dx: -1, dy: 0 } }),
    ])
      expect(isSheetObject(bad, 'image01'), JSON.stringify(bad).slice(0, 80)).toBe(false);
    expect(isSheetObject({ ...image(), imageId: 7 }, 'image01')).toBe(false);
  });
});

describe('an image on a sheet', () => {
  it('is set by a layout write, and follows its anchor when its row goes', () => {
    const [sheet] = makeSheets({ S: { A1: 'x' } }, { rows: 6, cols: 6 });
    const write = set(image());
    expect(validateWrite(sheet!, write)).toEqual({ ok: true });
    const placed = applySheetWrite(sheet!, write, { now: 1, by }).sheet;
    const after = applySheetWrite(
      placed,
      { kind: 'layout', changes: [{ k: 'deleteRows', ids: [R(1)] }] },
      { now: 2, by },
    ).sheet;
    expect(after.layout.objects).toEqual([image({ at: { r: R(2), c: C(2), dx: 4, dy: 8 } })]);
  });

  it('names the gallery images a sheet places, each once', () => {
    const chart = { id: 'chart01', kind: 'chart' } as SheetObject;
    expect(
      sheetImageIds({
        objects: [
          image(),
          image({ id: 'image02' }),
          image({ id: 'image03', imageId: 'img_b' }),
          chart,
        ],
      }),
    ).toEqual(['img_abc', 'img_b']);
    expect(sheetImageIds({})).toEqual([]);
  });
});

export type { Sheet };

describe('fittedImageSize', () => {
  it('keeps a picture that fits 600 by 400 at its natural size', () => {
    expect(fittedImageSize({ width: 320, height: 240 })).toEqual({ width: 320, height: 240 });
  });

  it('scales a wide picture down to 600 px wide, in proportion', () => {
    expect(fittedImageSize({ width: 1200, height: 300 })).toEqual({ width: 600, height: 150 });
  });

  it('scales a tall picture down to 400 px high, in proportion', () => {
    expect(fittedImageSize({ width: 300, height: 1200 })).toEqual({ width: 100, height: 400 });
  });

  it('keeps each side at least 16 px', () => {
    expect(fittedImageSize({ width: 6000, height: 10 })).toEqual({ width: 600, height: 16 });
    expect(fittedImageSize({ width: 4, height: 4 })).toEqual({ width: 16, height: 16 });
  });

  it('takes a picture of unknown size as a square', () => {
    expect(fittedImageSize({ width: 0, height: 0 })).toEqual({ width: 400, height: 400 });
  });
});
