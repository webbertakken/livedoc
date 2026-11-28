import { describe, expect, it } from 'vitest';
import type { SheetImage } from '@livedoc/sheets';
import {
  altOfTitled,
  IMAGE_HANDLES,
  imageLabel,
  newSheetImage,
  replacedImage,
  resizedImageBox,
} from './sheet-image-place';

const at = { r: 'r1', c: 'c1', dx: 0, dy: 0 };
const image = (over: Partial<SheetImage> = {}): SheetImage => ({
  id: 'i1',
  kind: 'image',
  at,
  width: 200,
  height: 100,
  imageId: 'img-1',
  ...over,
});

describe('newSheetImage', () => {
  it('lands at the anchor, fitted, keeping the natural size', () => {
    expect(newSheetImage('i9', { id: 'g1', width: 1200, height: 800 }, at)).toEqual({
      id: 'i9',
      kind: 'image',
      at,
      width: 600,
      height: 400,
      imageId: 'g1',
      naturalWidth: 1200,
      naturalHeight: 800,
    });
  });

  it('leaves out a natural size it does not know', () => {
    const made = newSheetImage('i9', { id: 'g1', width: 0, height: 0 }, at);
    expect(made).not.toHaveProperty('naturalWidth');
    expect(made).not.toHaveProperty('naturalHeight');
  });
});

describe('replacedImage', () => {
  it('keeps the width, follows the new proportion and lets the alt text go', () => {
    const next = replacedImage(image({ alt: 'A cat', naturalWidth: 400, naturalHeight: 200 }), {
      id: 'g2',
      width: 300,
      height: 600,
    });
    expect(next).toEqual({
      id: 'i1',
      kind: 'image',
      at,
      width: 200,
      height: 400,
      imageId: 'g2',
      naturalWidth: 300,
      naturalHeight: 600,
    });
  });

  it('keeps the box when the new picture has no size', () => {
    const next = replacedImage(image({ naturalWidth: 400, naturalHeight: 200 }), {
      id: 'g2',
      width: 0,
      height: 0,
    });
    expect(next).toMatchObject({ width: 200, height: 100, imageId: 'g2' });
    expect(next).not.toHaveProperty('naturalWidth');
  });

  it('keeps the height within bounds', () => {
    expect(replacedImage(image(), { id: 'g2', width: 10, height: 1000 }).height).toBe(4000);
  });
});

describe('resizedImageBox', () => {
  const box = { x: 100, y: 50, width: 200, height: 100 };

  it('lists the eight handles', () => {
    expect(IMAGE_HANDLES).toEqual(['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']);
  });

  it('stretches by an edge handle, the other side kept', () => {
    expect(resizedImageBox(box, 'e', 30, 99)).toEqual({ x: 100, y: 50, width: 230, height: 100 });
    expect(resizedImageBox(box, 's', 99, 20)).toEqual({ x: 100, y: 50, width: 200, height: 120 });
    expect(resizedImageBox(box, 'w', 30, 0)).toEqual({ x: 130, y: 50, width: 170, height: 100 });
    expect(resizedImageBox(box, 'n', 0, -10)).toEqual({ x: 100, y: 40, width: 200, height: 110 });
  });

  it('keeps the proportion by a corner handle, following the larger pull', () => {
    expect(resizedImageBox(box, 'se', 100, 0)).toEqual({ x: 100, y: 50, width: 300, height: 150 });
    expect(resizedImageBox(box, 'se', 0, 100)).toEqual({ x: 100, y: 50, width: 400, height: 200 });
  });

  it('grows a top-left corner up and left, the bottom-right corner staying', () => {
    expect(resizedImageBox(box, 'nw', -100, 0)).toEqual({ x: 0, y: 0, width: 300, height: 150 });
  });

  it('moves only the side a top-right or bottom-left corner holds', () => {
    expect(resizedImageBox(box, 'ne', 100, 0)).toEqual({ x: 100, y: 0, width: 300, height: 150 });
    expect(resizedImageBox(box, 'sw', -100, 0)).toEqual({ x: 0, y: 50, width: 300, height: 150 });
  });

  it('keeps the picture its own proportion when known', () => {
    expect(resizedImageBox(box, 'se', 100, 0, 1)).toEqual({
      x: 100,
      y: 50,
      width: 300,
      height: 300,
    });
  });

  it('never shrinks a side below 16 px, a corner keeping the proportion', () => {
    expect(resizedImageBox(box, 'e', -500, 0)).toMatchObject({ width: 16 });
    expect(resizedImageBox(box, 'se', -500, 0)).toMatchObject({ width: 32, height: 16 });
  });

  it('never grows a side past 4,000 px', () => {
    expect(resizedImageBox(box, 'se', 9000, 0)).toMatchObject({ width: 4000, height: 2000 });
  });
});

describe('altOfTitled', () => {
  it('folds the title above the description', () => {
    expect(altOfTitled(' A cat ', ' On a mat ')).toBe('A cat\nOn a mat');
  });

  it('keeps either alone', () => {
    expect(altOfTitled('', 'On a mat')).toBe('On a mat');
    expect(altOfTitled('A cat', '  ')).toBe('A cat');
  });

  it('keeps at most 1,000 characters', () => {
    expect(altOfTitled('', 'x'.repeat(1200))).toHaveLength(1000);
  });
});

describe('imageLabel', () => {
  it('names an image by its alt text, else Image', () => {
    expect(imageLabel(image({ alt: ' A cat ' }))).toBe('A cat');
    expect(imageLabel(image({ alt: '  ' }))).toBe('Image');
    expect(imageLabel(image())).toBe('Image');
  });
});
