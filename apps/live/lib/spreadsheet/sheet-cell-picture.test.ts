// docs/specs/029-sheets/inserted-objects.md "Images in a cell" (D632): a picture leaves the cell for an image over cells
// at its top-left, fitted as Insert fits one, and an image over cells leaves the sheet's objects for the active cell,
// its alt text kept both ways, each one write.
import { describe, expect, it } from 'vitest';
import type { SheetImage } from '@livedoc/sheets';
import { cellPictureOf, pictureIntoCellWrite, pictureOverCellsWrite } from './sheet-cell-picture';

const image: SheetImage = {
  id: 'i1',
  kind: 'image',
  at: { r: 'r1', c: 'c1', dx: 4, dy: 2 },
  width: 120,
  height: 80,
  imageId: 'g-cat',
  naturalWidth: 1200,
  naturalHeight: 800,
  alt: 'A cat',
};

describe('pictureIntoCellWrite', () => {
  it('takes the image off the sheet and puts it in the cell, its alt text kept', () => {
    expect(pictureIntoCellWrite(image, { r: 'r9', c: 'c9' })).toEqual({
      kind: 'layout',
      changes: [{ k: 'object', id: 'i1', object: null }],
      cells: [{ r: 'r9', c: 'c9', i: { img: { id: 'g-cat', alt: 'A cat' } } }],
    });
  });

  it('puts an image without alt text in the cell without any', () => {
    const { alt: _, ...plain } = image;
    expect(pictureIntoCellWrite(plain, { r: 'r9', c: 'c9' })).toMatchObject({
      cells: [{ r: 'r9', c: 'c9', i: { img: { id: 'g-cat' } } }],
    });
  });
});

describe('pictureOverCellsWrite', () => {
  it('empties the cell and places the picture at its top-left, fitted to 600 by 400, its alt text kept', () => {
    const write = pictureOverCellsWrite(
      'i2',
      { id: 'g-dog', alt: 'A dog' },
      { r: 'r3', c: 'c2' },
      { width: 1200, height: 600 },
    );
    expect(write).toEqual({
      kind: 'layout',
      changes: [
        {
          k: 'object',
          id: 'i2',
          object: {
            id: 'i2',
            kind: 'image',
            at: { r: 'r3', c: 'c2', dx: 0, dy: 0 },
            width: 600,
            height: 300,
            imageId: 'g-dog',
            naturalWidth: 1200,
            naturalHeight: 600,
            alt: 'A dog',
          },
        },
      ],
      cells: [{ r: 'r3', c: 'c2', i: null }],
    });
  });

  it('lands square when the picture’s size is unknown, with no alt text when it has none', () => {
    const write = pictureOverCellsWrite('i2', { id: 'g-dog' }, { r: 'r3', c: 'c2' }, null);
    const [change] = write.kind === 'layout' ? write.changes : [];
    const object = change?.k === 'object' ? change.object : null;
    expect(object).toMatchObject({ width: 400, height: 400 });
    expect(object).not.toHaveProperty('alt');
  });
});

describe('cellPictureOf', () => {
  it('is the picture a cell holds, by its own input only', () => {
    expect(cellPictureOf({ input: { img: { id: 'g' } } })).toEqual({ id: 'g' });
    expect(cellPictureOf({ input: { n: 1 } })).toBeNull();
    expect(cellPictureOf(undefined)).toBeNull();
  });
});
