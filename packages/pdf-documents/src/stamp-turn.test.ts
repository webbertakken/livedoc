import { describe, expect, it } from 'vitest';
import { Mark, type StampMark } from './mark';
import { MarkHit } from './mark-hit';
import { MarkReshape } from './mark-reshape';
import { PageName } from './page-name';
import { StampTurn } from './stamp-turn';

// marks.md "Changing a mark": A stamp's quarter turns, about its middle, held on its page; its box as it shows.
const stamp = (turn?: 90 | 180 | 270, rect: StampMark['rect'] = [100, 100, 160, 120]): StampMark =>
  Mark.stamp({
    id: 's',
    page: PageName.ofObject(3),
    stamp: 'approved',
    rect,
    lines: ['APPROVED'],
    colour: '#188038',
    opacity: 1,
    author: 'Ada',
    createdAt: 1,
    ...(turn ? { turn } : {}),
  })!;
const PAGE = [0, 0, 612, 792] as const;

describe('a stamp turned', () => {
  it('keeps its turn, read back, and shows a quarter turn’s box with its sides swapped', () => {
    expect(stamp(90).turn).toBe(90);
    expect(Mark.parse({ ...stamp(), turn: 45 })).not.toHaveProperty('turn');
    expect(Mark.bounds(stamp(90))).toEqual([120, 80, 140, 140]);
    expect(Mark.bounds(stamp(180))).toEqual([100, 100, 160, 120]);
  });

  it('steps a quarter each way, upright again after four', () => {
    expect(StampTurn.next(undefined, 'counterclockwise')).toBe(90);
    expect(StampTurn.next(undefined, 'clockwise')).toBe(270);
    expect(StampTurn.next(90, 'clockwise')).toBeUndefined();
    expect(StampTurn.next(270, 'counterclockwise')).toBeUndefined();
  });

  it('turns about its middle, its upright box kept, and is moved back onto its page', () => {
    expect(StampTurn.turned(stamp(), 'clockwise', PAGE)).toEqual({
      turn: 270,
      rect: [100, 100, 160, 120],
    });
    expect(StampTurn.turned(stamp(90), 'clockwise', PAGE)).toEqual({ rect: [100, 100, 160, 120] });
    // Near the foot, the turned box would leave the page: it moves up.
    expect(StampTurn.turned(stamp(undefined, [100, 2, 160, 22]), 'clockwise', PAGE)).toEqual({
      turn: 270,
      rect: [100, 20, 160, 40],
    });
  });

  it('is resized by the box it shows, keeping its turn', () => {
    expect(MarkReshape.box(stamp(90))).toEqual([120, 80, 140, 140]);
    expect(MarkReshape.reboxed(stamp(90), [120, 80, 150, 140])).toEqual({ rect: [105, 95, 165, 125] });
  });

  it('is reached where it shows', () => {
    expect(MarkHit.at([stamp(90)], { x: 130, y: 135 }, 1)?.id).toBe('s');
    expect(MarkHit.at([stamp(90)], { x: 155, y: 110 }, 1)).toBeNull();
  });

  it('finds the upright box from the box shown', () => {
    expect(StampTurn.upright([120, 80, 140, 140], 90)).toEqual([100, 100, 160, 120]);
    expect(StampTurn.upright([1, 2, 3, 4], undefined)).toEqual([1, 2, 3, 4]);
  });

  it('turns its upright drawing into place by its matrix, none upright', () => {
    expect(StampTurn.matrix(stamp())).toBeNull();
    const [a, b, c, d, e, f] = StampTurn.matrix(stamp(90))!;
    const at = (x: number, y: number) => [a * x + c * y + e, b * x + d * y + f];
    // The upright right edge's middle turns up to the top of the box shown.
    expect(at(160, 110)).toEqual([130, 140]);
    expect(at(130, 110)).toEqual([130, 110]);
  });
});
