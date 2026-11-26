import { describe, expect, it } from 'vitest';
import { Mark, type Box, type StampMark } from './mark';
import { MarkHit } from './mark-hit';
import { MarkReshape } from './mark-reshape';
import { MarkTurn } from './mark-turn';
import { PageName } from './page-name';

// marks.md "Changing a mark": Rotate. A stamp, a Text, a Rectangle and an Ellipse hold their angle; a Line, an Arrow, a
// Polygon, a Cloud and Connected lines turn their points; a Callout and a Drawing are left out.
const base = {
  page: PageName.ofObject(3),
  colour: '#188038',
  opacity: 1,
  author: 'Ada',
  createdAt: 1,
};
const stamp = (turn?: number, rect: Box = [100, 100, 160, 120]): StampMark =>
  Mark.stamp({
    ...base,
    id: 's',
    stamp: 'approved',
    rect,
    lines: ['APPROVED'],
    ...(turn ? { turn } : {}),
  })!;
const rectangle = (turn?: number) =>
  Mark.shape('rectangle', {
    ...base,
    id: 'r',
    rect: [100, 100, 200, 140],
    width: 2,
    ...(turn ? { turn } : {}),
  })!;
const PAGE: Box = [0, 0, 612, 792];
const close = (box: readonly number[], to: readonly number[], digits = 6) =>
  to.forEach((n, at) => expect(box[at]).toBeCloseTo(n, digits));
const cos30 = Math.cos(Math.PI / 6);

describe('a mark’s angle', () => {
  it('is whole degrees 0 to 359, upright as none', () => {
    expect(MarkTurn.normal(0)).toBeUndefined();
    expect(MarkTurn.normal(360)).toBeUndefined();
    expect(MarkTurn.normal(-90)).toBe(270);
    expect(MarkTurn.normal(29.6)).toBe(30);
    expect(MarkTurn.normal(725)).toBe(5);
  });

  it('snaps to the nearest 15°', () => {
    expect(MarkTurn.snap(37)).toBe(30);
    expect(MarkTurn.snap(38)).toBe(45);
    expect(MarkTurn.snap(-7)).toBeUndefined();
    expect(MarkTurn.snap(-8)).toBe(345);
    expect(MarkTurn.snap(359)).toBeUndefined();
  });

  it('steps a quarter each way from any angle, upright again after four', () => {
    expect(MarkTurn.next(undefined, 'counterclockwise')).toBe(90);
    expect(MarkTurn.next(undefined, 'clockwise')).toBe(270);
    expect(MarkTurn.next(90, 'clockwise')).toBeUndefined();
    expect(MarkTurn.next(30, 'clockwise')).toBe(300);
    expect(MarkTurn.next(300, 'counterclockwise')).toBe(30);
  });

  it('is held by the four boxed kinds; points stand at none', () => {
    expect(MarkTurn.angleOf(stamp(30))).toBe(30);
    expect(MarkTurn.angleOf(rectangle(45))).toBe(45);
    expect(MarkTurn.angleOf(rectangle())).toBe(0);
    const line = Mark.line('line', { ...base, id: 'l', line: [0, 0, 10, 0], width: 1 })!;
    expect(MarkTurn.angleOf(line)).toBe(0);
  });
});

describe('a turned box', () => {
  it('shows a quarter turn’s box with its sides swapped, and 30° as its turned bounds', () => {
    expect(Mark.bounds(stamp(90))).toEqual([120, 80, 140, 140]);
    expect(Mark.bounds(stamp(180))).toEqual([100, 100, 160, 120]);
    // 60 × 20 turned 30°: 60 cos + 20 sin wide, 60 sin + 20 cos high, about (130, 110).
    const wide = 60 * cos30 + 20 * 0.5;
    const high = 60 * 0.5 + 20 * cos30;
    close(Mark.bounds(stamp(30)), [130 - wide / 2, 110 - high / 2, 130 + wide / 2, 110 + high / 2]);
  });

  it('finds the upright box again from the box shown, and a square near 45°', () => {
    close(MarkTurn.uprightOf([120, 80, 140, 140], 90), [100, 100, 160, 120]);
    close(
      MarkTurn.uprightOf(MarkTurn.shownBox([100, 100, 160, 120], 30), 30),
      [100, 100, 160, 120],
    );
    close(
      MarkTurn.uprightOf(MarkTurn.shownBox([100, 100, 160, 120], 210), 210),
      [100, 100, 160, 120],
    );
    expect(MarkTurn.uprightOf([1, 2, 3, 4], undefined)).toEqual([1, 2, 3, 4]);
    // At 45° every box shows a square: read as a square of the shown width.
    const shown = MarkTurn.shownBox([100, 100, 160, 120], 45);
    const side = (shown[2] - shown[0]) / Math.SQRT2;
    close(MarkTurn.uprightOf(shown, 45), [
      130 - side / 2,
      110 - side / 2,
      130 + side / 2,
      110 + side / 2,
    ]);
    // Within 1° of it too: 134° reads a square across the shown width over |cos| + |sin|.
    const near = MarkTurn.shownBox([0, 0, 40, 10], 134);
    const across =
      Math.abs(Math.cos((134 * Math.PI) / 180)) + Math.abs(Math.sin((134 * Math.PI) / 180));
    const square = MarkTurn.uprightOf(near, 134);
    close(
      [square[2] - square[0], square[3] - square[1]],
      [(near[2] - near[0]) / across, (near[2] - near[0]) / across],
    );
  });

  it('turns its upright drawing into place by its matrix, none upright', () => {
    expect(MarkTurn.matrix(stamp())).toBeNull();
    const at = ([a, b, c, d, e, f]: readonly number[], x: number, y: number) => [
      a! * x + c! * y + e!,
      b! * x + d! * y + f!,
    ];
    const quarter = MarkTurn.matrix(stamp(90))!;
    // The upright right edge's middle turns up to the top of the box shown.
    expect(at(quarter, 160, 110)).toEqual([130, 140]);
    expect(at(quarter, 130, 110)).toEqual([130, 110]);
    const thirty = MarkTurn.matrix(stamp(30))!;
    close(thirty.slice(0, 4), [cos30, 0.5, -0.5, cos30]);
    close(at(thirty, 160, 110), [130 + 30 * cos30, 110 + 15]);
    const fortyFive = MarkTurn.matrix(stamp(45))!;
    close(at(fortyFive, 130, 120), [130 - 10 / Math.SQRT2, 110 + 10 / Math.SQRT2]);
  });
});

describe('a mark turned', () => {
  it('keeps a boxed mark’s upright box, takes the angle, and is moved back onto its page', () => {
    expect(MarkTurn.turned(stamp(), 270, PAGE)).toEqual({ turn: 270, rect: [100, 100, 160, 120] });
    expect(MarkTurn.turned(stamp(90), 0, PAGE)).toEqual({ rect: [100, 100, 160, 120] });
    // Near the foot, the turned box would leave the page: it moves up.
    expect(MarkTurn.turned(stamp(undefined, [100, 2, 160, 22]), 270, PAGE)).toEqual({
      turn: 270,
      rect: [100, 20, 160, 40],
    });
    expect(MarkTurn.turned(rectangle(), 30, PAGE)).toEqual({
      turn: 30,
      rect: [100, 100, 200, 140],
    });
  });

  it('turns a line’s and a polygon’s points about their middle, held on the page', () => {
    const line = Mark.line('arrow', { ...base, id: 'l', line: [100, 100, 140, 100], width: 1 })!;
    expect(MarkTurn.turned(line, 90, PAGE)).toEqual({ line: [120, 80, 120, 120] });
    const poly = Mark.poly('polygon', {
      ...base,
      id: 'p',
      corners: [0, 0, 40, 0, 40, 20],
      width: 1,
    })!;
    // Turned a quarter about (20, 10), it would reach x = 10 to 30 and y = -10 to 30: moved up onto the page.
    expect(MarkTurn.turned(poly, 90, PAGE)).toEqual({ corners: [30, 0, 30, 40, 10, 40] });
  });

  it('leaves a Callout and a Drawing as they are', () => {
    const drawing = Mark.drawing({ ...base, id: 'd', strokes: [[0, 0, 10, 10]], width: 1 })!;
    expect(MarkTurn.turned(drawing, 90, PAGE)).toBeNull();
    expect(Mark.turns(drawing)).toBeNull();
  });

  it('takes a page point into its own frame and back', () => {
    const turned = stamp(90);
    expect(MarkTurn.toFrame({ x: 130, y: 140 }, turned)).toEqual({ x: 160, y: 110 });
    expect(MarkTurn.fromFrame({ x: 160, y: 110 }, turned)).toEqual({ x: 130, y: 140 });
    expect(MarkTurn.toFrame({ x: 1, y: 2 }, stamp())).toEqual({ x: 1, y: 2 });
  });
});

describe('a turned mark changed', () => {
  it('is reached where it shows', () => {
    expect(MarkHit.at([stamp(90)], { x: 130, y: 135 }, 1)?.id).toBe('s');
    expect(MarkHit.at([stamp(90)], { x: 155, y: 110 }, 1)).toBeNull();
    // At 30° the upright box's right end has turned up: its corner at (160, 120) shows higher and left.
    const corner = MarkTurn.fromFrame({ x: 158, y: 118 }, stamp(30));
    expect(MarkHit.at([stamp(30)], corner, 1)?.id).toBe('s');
    expect(MarkHit.at([stamp(30)], { x: 158, y: 101 }, 1)).toBeNull();
    // A turned Rectangle by its line.
    const edge = MarkTurn.fromFrame({ x: 150, y: 140 }, rectangle(30));
    expect(MarkHit.at([rectangle(30)], edge, 1)?.id).toBe('r');
    expect(MarkHit.at([rectangle(30)], { x: 150, y: 120 }, 1)).toBeNull();
  });

  it('is resized in its own frame, its angle kept and the corner held where it shows', () => {
    const turned = rectangle(30);
    expect(MarkReshape.box(turned)).toEqual([100, 100, 200, 140]);
    // The south-west corner is held: dragging the north-east one out by 20 × 10 in the frame.
    const held = MarkTurn.fromFrame({ x: 100, y: 100 }, turned);
    const place = MarkReshape.reboxed(turned, [100, 100, 220, 150]) as { rect: Box };
    close([place.rect[2] - place.rect[0], place.rect[3] - place.rect[1]], [120, 50]);
    const after = { ...turned, ...place };
    const moved = MarkTurn.fromFrame({ x: place.rect[0], y: place.rect[1] }, after);
    close([moved.x, moved.y], [held.x, held.y]);
  });
});
