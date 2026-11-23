// A placed picture's drawing (docs/specs/034-text-documents/objects.md "In the editor").
import { describe, expect, it } from 'vitest';
import { placedLayout, roomStyle } from './text-document-picture-placed';

const margin = (all: number) => ({ top: all, right: all, bottom: all, left: all });
const picture = (placement: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  width: 100,
  height: 50,
  placement: { wrap: 'wrap', margin: margin(9), moves: 'with-text', x: 20, y: 30, ...placement },
  ...extra,
});

describe('placedLayout', () => {
  it('draws a picture in line as no placed layout', () => {
    expect(placedLayout({ width: 100, height: 50 }, 450)).toBeNull();
    expect(placedLayout({ width: 100, height: 50, placement: { wrap: 'nope' } }, 450)).toBeNull();
  });

  it('places a picture at its offsets from its paragraph and its column', () => {
    expect(placedLayout(picture({}), 450)?.picture).toEqual({ left: 20, top: 30 });
  });

  it('keeps the text clear of a Wrap picture and its margins, beside it on the side with more room', () => {
    expect(placedLayout(picture({}), 450)).toMatchObject({
      layer: 'flow',
      room: { side: 'left', top: 21, bottom: 89, left: 11, right: 129 },
    });
    // Its middle in the column's right half: the text runs on its left.
    expect(placedLayout(picture({ x: 300 }), 450)?.room?.side).toBe('right');
  });

  it('keeps a Break picture clear across its column', () => {
    expect(placedLayout(picture({ wrap: 'break' }), 450)?.room?.side).toBe('across');
  });

  it('makes room only below its paragraph top, and none for a picture wholly above it', () => {
    expect(placedLayout(picture({ y: -20 }), 450)?.room).toMatchObject({ top: 0, bottom: 39 });
    expect(placedLayout(picture({ y: -100 }), 450)?.room).toBeUndefined();
  });

  it('keeps the text clear of a turned picture’s bounds', () => {
    const room = placedLayout(picture({ margin: margin(0) }, { rotation: 90 }), 450)?.room;
    // 100 × 50 turned a quarter: 50 × 100 about the same centre (70, 55).
    expect(room).toMatchObject({ left: 45, right: 95, top: 5, bottom: 105 });
  });

  it('draws In front of text and Behind text without room', () => {
    expect(placedLayout(picture({ wrap: 'front' }), 450)).toEqual({
      picture: { left: 20, top: 30 },
      layer: 'front',
    });
    expect(placedLayout(picture({ wrap: 'behind' }), 450)?.layer).toBe('behind');
  });

  it('moves a picture fixed on the page by its paragraph’s place on its page', () => {
    const fixed = picture({ moves: 'page', x: 72, y: 100 });
    expect(placedLayout(fixed, 450, { x: -72, y: -40 })?.picture).toEqual({ left: 0, top: 60 });
    // One moving with text takes no shift.
    expect(placedLayout(picture({}), 450, { x: -72, y: -40 })?.picture).toEqual({
      left: 20,
      top: 30,
    });
  });
});

describe('roomStyle', () => {
  it('floats a Wrap picture’s room on its side, its shape the picture and its margins', () => {
    expect(roomStyle({ side: 'left', top: 21, bottom: 89, left: 11, right: 129 })).toBe(
      'float: left; height: 89pt; width: max(0pt, calc(129pt - var(--text-document-indent-start, 0pt))); ' +
        'shape-outside: inset(21pt 0 0 max(0pt, calc(100% - 118pt)))',
    );
    expect(roomStyle({ side: 'right', top: 0, bottom: 50, left: 300, right: 400 })).toBe(
      'float: right; height: 50pt; width: max(0pt, calc(100% - 300pt + var(--text-document-indent-start, 0pt))); ' +
        'shape-outside: inset(0pt max(0pt, calc(100% - 100pt)) 0 0)',
    );
  });

  it('floats a Break picture’s room across the whole column', () => {
    expect(roomStyle({ side: 'across', top: 10, bottom: 60, left: 0, right: 100 })).toBe(
      'float: left; height: 60pt; width: 100%; shape-outside: inset(10pt 0 0 0)',
    );
  });
});
