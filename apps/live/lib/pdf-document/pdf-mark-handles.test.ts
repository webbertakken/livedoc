// docs/specs/035-pdf-documents/marks.md "Changing a mark": a box's handle moves the sides it sits on as they show on
// screen, ⇧ with a corner keeps proportions, at least PDF_SHAPE_MIN_PT each way and on the page; a line's end, a
// Callout's tip and knee; ⌥ with the arrow keys resizes from the right or foot as it shows, or moves a line's end.
import { describe, expect, it } from 'vitest';
import {
  Mark,
  MarkReshape,
  PageName,
  PDF_SHAPE_MIN_PT,
  TypedLayout,
  type Box,
  type PageMatrix,
} from '@livedoc/pdf-documents';
import { dragHandle, handlePlaces, keyResize } from './pdf-mark-handles';

const BASE = {
  page: PageName.ofObject(1),
  colour: '#ff0000',
  opacity: 1,
  author: 'Ada',
  createdAt: 1,
};
// Page space to view space as drawn upright on a page 400 high: y runs down.
const UPRIGHT: PageMatrix = [1, 0, 0, -1, 0, 400];
// Turned a quarter clockwise: page x runs down the screen, page y left to right.
const TURNED: PageMatrix = [0, 1, 1, 0, 0, 0];
const PAGE: Box = [0, 0, 400, 400];

const ellipse = Mark.shape('ellipse', { ...BASE, id: 'e', rect: [100, 100, 200, 150], width: 2 })!;
const arrow = Mark.line('arrow', { ...BASE, id: 'a', line: [10, 10, 50, 60], width: 2 })!;
const callout = Mark.callout({
  ...BASE,
  id: 'c',
  rect: [300, 300, 380, 330],
  words: 'Hi',
  size: 12,
  callout: [250, 250, 288, 315, 300, 315],
})!;

describe('handlePlaces', () => {
  it('places a box’s eight handles on its corners and sides as it shows', () => {
    // The ellipse shows from x 100 to 200 and y 250 to 300.
    expect(handlePlaces(ellipse, UPRIGHT)).toEqual([
      { handle: 'nw', at: { x: 100, y: 250 } },
      { handle: 'n', at: { x: 150, y: 250 } },
      { handle: 'ne', at: { x: 200, y: 250 } },
      { handle: 'e', at: { x: 200, y: 275 } },
      { handle: 'se', at: { x: 200, y: 300 } },
      { handle: 's', at: { x: 150, y: 300 } },
      { handle: 'sw', at: { x: 100, y: 300 } },
      { handle: 'w', at: { x: 100, y: 275 } },
    ]);
  });

  it('places a line’s ends and a Callout’s tip and knee where they show', () => {
    expect(handlePlaces(arrow, UPRIGHT)).toEqual([
      { handle: 'start', at: { x: 10, y: 390 } },
      { handle: 'end', at: { x: 50, y: 340 } },
    ]);
    expect(handlePlaces(callout, UPRIGHT).slice(-2)).toEqual([
      { handle: 'tip', at: { x: 250, y: 150 } },
      { handle: 'knee', at: { x: 288, y: 85 } },
    ]);
  });
});

describe('dragHandle', () => {
  it('moves the sides a box handle sits on to the pointer', () => {
    expect(dragHandle(ellipse, 'se', UPRIGHT, { x: 260, y: 340 }, false, PAGE)).toEqual({
      rect: [100, 60, 260, 150],
    });
    expect(dragHandle(ellipse, 'n', UPRIGHT, { x: 999, y: 200 }, false, PAGE)).toEqual({
      rect: [100, 100, 200, 200],
    });
    expect(dragHandle(ellipse, 'w', UPRIGHT, { x: 50, y: 0 }, false, PAGE)).toEqual({
      rect: [50, 100, 200, 150],
    });
  });

  it('keeps proportions with ⇧ on a corner', () => {
    // Twice as wide as high: dragged to 300 across, it is 200 wide and 100 high.
    expect(dragHandle(ellipse, 'se', UPRIGHT, { x: 300, y: 310 }, true, PAGE)).toEqual({
      rect: [100, 50, 300, 150],
    });
  });

  it('keeps proportions from the top-left corner, and none for a box with no height', () => {
    expect(dragHandle(ellipse, 'nw', UPRIGHT, { x: 0, y: 240 }, true, PAGE)).toEqual({
      rect: [0, 100, 200, 200],
    });
    const flat = Mark.drawing({ ...BASE, id: 'f', strokes: [[10, 10, 30, 10]], width: 2 })!;
    expect(dragHandle(flat, 'se', UPRIGHT, { x: 50, y: 400 }, true, PAGE)).toEqual({
      strokes: [[10, 0, 50, 0]],
    });
  });

  it('keeps a box at least the least size, and on its page', () => {
    expect(dragHandle(ellipse, 'e', UPRIGHT, { x: 0, y: 275 }, false, PAGE)).toEqual({
      rect: [100, 100, 100 + PDF_SHAPE_MIN_PT, 150],
    });
    expect(dragHandle(ellipse, 'nw', UPRIGHT, { x: -50, y: -50 }, false, PAGE)).toEqual({
      rect: [0, 100, 200, 400],
    });
  });

  it('follows the page’s turn: the side that shows on the right is dragged', () => {
    // Turned, the ellipse shows from x 100 to 150 and y 100 to 200; its right side on screen is page y 150.
    expect(dragHandle(ellipse, 'e', TURNED, { x: 170, y: 150 }, false, PAGE)).toEqual({
      rect: [100, 100, 200, 170],
    });
  });

  it('moves a line’s end, a Callout’s tip and knee, held on the page', () => {
    expect(dragHandle(arrow, 'end', UPRIGHT, { x: 500, y: 100 }, false, PAGE)).toEqual({
      line: [10, 10, 400, 300],
    });
    expect(dragHandle(callout, 'knee', UPRIGHT, { x: 280, y: 70 }, false, PAGE)).toEqual({
      rect: callout.rect,
      callout: [250, 250, 280, 330, 300, 315],
    });
    expect(dragHandle(callout, 'tip', UPRIGHT, { x: 390, y: 390 }, false, PAGE)).toEqual(
      MarkReshape.pointed(callout, 'tip', { x: 390, y: 10 }),
    );
  });

  it('runs a Callout’s line again when its box is sized', () => {
    const place = dragHandle(callout, 'e', UPRIGHT, { x: 390, y: 85 }, false, PAGE);
    expect(place).toEqual({
      rect: [300, 300, 390, 330],
      callout: TypedLayout.calloutLine({ x: 250, y: 250 }, [300, 300, 390, 330]),
    });
  });

  it('sizes nothing for a matrix that cannot be turned back, or a handle the mark has not', () => {
    expect(dragHandle(ellipse, 'se', [0, 0, 0, 0, 0, 0], { x: 1, y: 1 }, false, PAGE)).toBeNull();
    expect(dragHandle(arrow, 'end', [0, 0, 0, 0, 0, 0], { x: 1, y: 1 }, false, PAGE)).toBeNull();
    expect(dragHandle(ellipse, 'tip', UPRIGHT, { x: 1, y: 1 }, false, PAGE)).toBeNull();
  });
});

describe('keyResize', () => {
  it('sizes a box from its right and foot as it shows, a line by its second end', () => {
    expect(keyResize(ellipse, UPRIGHT, { x: 10, y: 0 }, PAGE)).toEqual({
      rect: [100, 100, 210, 150],
    });
    expect(keyResize(ellipse, UPRIGHT, { x: 0, y: -10 }, PAGE)).toEqual({
      rect: [100, 110, 200, 150],
    });
    expect(keyResize(arrow, UPRIGHT, { x: 1, y: 0 }, PAGE)).toEqual({ line: [10, 10, 51, 60] });
  });

  it('sizes the box round a Polygon’s corners from its right and foot, the corners scaled within it', () => {
    const polygon = Mark.poly('polygon', {
      ...BASE,
      id: 'g',
      corners: [100, 100, 200, 100, 150, 200],
      width: 2,
    })!;
    expect(keyResize(polygon, UPRIGHT, { x: 100, y: 0 }, PAGE)).toEqual({
      corners: [100, 100, 300, 100, 200, 200],
    });
    expect(handlePlaces(polygon, UPRIGHT).map((place) => place.handle)).toEqual([
      'corner-0',
      'corner-1',
      'corner-2',
    ]);
  });

  it('sizes nothing for a text mark', () => {
    const highlight = Mark.highlight({
      ...BASE,
      id: 'h',
      quads: [[100, 316, 200, 316, 100, 300, 200, 300]],
      text: 'x',
    })!;
    expect(keyResize(highlight, UPRIGHT, { x: 1, y: 0 }, PAGE)).toBeNull();
  });
});

// marks.md "Changing a mark": Rotate. A turned mark's handles sit on its box turned with it; a drag sizes it in its
// own frame, its angle kept and the corner held where it shows.
describe('a turned mark’s handles', () => {
  const turned = { ...ellipse, turn: 90 };

  it('sit on its box turned with it', () => {
    const places = handlePlaces(turned, UPRIGHT);
    // The upright box (100, 100)-(200, 150) a quarter anticlockwise about (150, 125): its east side's middle is on top.
    const east = places.find((place) => place.handle === 'e')!.at;
    expect(east.x).toBeCloseTo(150, 6);
    expect(east.y).toBeCloseTo(400 - 175, 6);
  });

  it('size it in its own frame, the opposite corner held where it shows', () => {
    const east = handlePlaces(turned, UPRIGHT).find((place) => place.handle === 'e')!.at;
    // Dragged 20 further out (up on screen): 20 wider in its frame, its angle kept, its west side where it was.
    const place = dragHandle(turned, 'e', UPRIGHT, { x: east.x, y: east.y - 20 }, false, PAGE)!;
    const rect = (place as { rect: Box }).rect;
    expect(rect[2] - rect[0]).toBeCloseTo(120, 6);
    expect(rect[3] - rect[1]).toBeCloseTo(50, 6);
    const after = { ...turned, ...place };
    const west = handlePlaces(after, UPRIGHT).find((p) => p.handle === 'w')!.at;
    const westBefore = handlePlaces(turned, UPRIGHT).find((p) => p.handle === 'w')!.at;
    expect(west.x).toBeCloseTo(westBefore.x, 6);
    expect(west.y).toBeCloseTo(westBefore.y, 6);
    expect(MarkReshape.box(after)).toEqual(rect);
  });
});
