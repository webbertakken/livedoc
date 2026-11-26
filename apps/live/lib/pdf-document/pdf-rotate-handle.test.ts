// docs/specs/035-pdf-documents/marks.md "Changing a mark": Rotate, The handle. A gap above the top of the box as it
// shows, joined to it; a drag asks for the pointer's swing about the mark's middle, snapped to 15°.
import { describe, expect, it } from 'vitest';
import { Mark, PageName, type PageMatrix } from '@livedoc/pdf-documents';
import { rotateDraft, rotateHandlePlace, turnedViewBox } from './pdf-rotate-handle';

const BASE = {
  page: PageName.ofObject(3),
  colour: '#188038',
  opacity: 1,
  author: 'Ada',
  createdAt: 1,
};
// An upright US Letter page: view y runs down.
const VIEW: PageMatrix = [1, 0, 0, -1, 0, 792];
const PAGE = [0, 0, 612, 792] as const;
const stamp = (turn?: number) =>
  Mark.stamp({
    ...BASE,
    id: 's',
    stamp: 'approved',
    rect: [100, 100, 160, 120],
    lines: ['APPROVED'],
    ...(turn ? { turn } : {}),
  })!;
const close = (point: { x: number; y: number }, x: number, y: number) => {
  expect(point.x).toBeCloseTo(x, 6);
  expect(point.y).toBeCloseTo(y, 6);
};

describe('rotateHandlePlace', () => {
  it('stands the gap above the top middle of an upright box', () => {
    const place = rotateHandlePlace(stamp(), VIEW, 24)!;
    close(place.foot, 130, 792 - 120);
    close(place.at, 130, 792 - 120 - 24);
  });

  it('goes round with a turned box: at 90° it stands out to the left', () => {
    const place = rotateHandlePlace(stamp(90), VIEW, 24)!;
    // The upright top's middle (130, 120) turned a quarter anticlockwise about (130, 110) lies at (120, 110).
    close(place.foot, 120, 792 - 110);
    close(place.at, 96, 792 - 110);
  });

  it('stands above a line’s bounds, and none for a mark that does not turn', () => {
    const line = Mark.line('line', { ...BASE, id: 'l', line: [100, 100, 140, 120], width: 1 })!;
    close(rotateHandlePlace(line, VIEW, 10)!.at, 120, 792 - 130);
    const drawing = Mark.drawing({ ...BASE, id: 'd', strokes: [[0, 0, 9, 9]], width: 1 })!;
    expect(rotateHandlePlace(drawing, VIEW, 10)).toBeNull();
  });
});

describe('rotateDraft', () => {
  const rest = { x: 130, y: 144 };

  it('asks for the pointer’s swing about the middle, snapped to 15°', () => {
    // A pointer up and to the left at 37° past upright: 30°.
    const angle = ((90 + 37) * Math.PI) / 180;
    const pointer = { x: 130 + 50 * Math.cos(angle), y: 110 + 50 * Math.sin(angle) };
    expect(rotateDraft(stamp(), rest, pointer, PAGE)).toEqual({
      to: 30,
      place: { rect: [100, 100, 160, 120], turn: 30 },
    });
    // Back upright, the angle is taken away explicitly.
    expect(
      rotateDraft(
        stamp(30),
        { x: 130 - 34 * Math.sin(Math.PI / 6), y: 110 + 34 * Math.cos(Math.PI / 6) },
        { x: 131, y: 160 },
        PAGE,
      ),
    ).toEqual({
      to: 0,
      place: { rect: [100, 100, 160, 120], turn: undefined },
    });
  });

  it('turns a mark that turns its points by its swing, and none that does not turn', () => {
    const line = Mark.line('line', { ...BASE, id: 'l', line: [100, 100, 140, 100], width: 1 })!;
    const draft = rotateDraft(line, { x: 120, y: 140 }, { x: 80, y: 100 }, PAGE)!;
    expect(draft.to).toBe(90);
    expect(draft.place).toEqual({ line: [120, 80, 120, 120] });
    const drawing = Mark.drawing({ ...BASE, id: 'd', strokes: [[0, 0, 9, 9]], width: 1 })!;
    expect(rotateDraft(drawing, rest, { x: 0, y: 0 }, PAGE)).toBeNull();
  });
});

describe('turnedViewBox', () => {
  it('is a turned mark’s own box about its middle, turned on screen the way it shows', () => {
    const box = turnedViewBox(stamp(90), VIEW)!;
    expect(box.x).toBeCloseTo(100, 6);
    expect(box.y).toBeCloseTo(792 - 120, 6);
    expect(box.width).toBeCloseTo(60, 6);
    expect(box.height).toBeCloseTo(20, 6);
    // Anticlockwise on the page is anticlockwise on screen: CSS's negative.
    expect(box.degrees).toBeCloseTo(-90, 6);
    expect(turnedViewBox(stamp(30), VIEW)!.degrees).toBeCloseTo(-30, 6);
    expect(turnedViewBox(stamp(), VIEW)).toBeNull();
  });
});
