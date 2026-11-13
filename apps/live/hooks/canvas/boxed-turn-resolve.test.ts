import { describe, expect, it } from 'vitest';
import { createShape, type Element, type ShapeElement } from '@livedoc/document';
import { resolveBoxedTurn, sweptDegrees, ROTATE_SNAP_DEGREES } from './boxed-turn-resolve';

// docs/specs/008-canvas/selection-transforms.md "Rotating by hand".
describe('sweptDegrees', () => {
  const pivot = { x: 0, y: 0 };

  it('reads a clockwise sweep (y down) as positive', () => {
    expect(sweptDegrees(pivot, { x: 10, y: 0 }, { x: 0, y: 10 })).toBeCloseTo(90);
    expect(sweptDegrees(pivot, { x: 10, y: 0 }, { x: 0, y: -10 })).toBeCloseTo(-90);
  });

  it('takes the short way across the ±180° seam', () => {
    expect(sweptDegrees(pivot, { x: -10, y: -1 }, { x: -10, y: 1 })).toBeCloseTo(-11.42, 1);
  });

  it('reads no sweep for a pointer on the pivot', () => {
    expect(sweptDegrees(pivot, { x: 0, y: 0 }, { x: 5, y: 5 })).toBe(0);
  });
});

describe('resolveBoxedTurn', () => {
  const a: ShapeElement = { ...createShape('square', 0, 0), id: 'a', width: 20, height: 10 };
  const b: ShapeElement = {
    ...createShape('square', 80, 0),
    id: 'b',
    width: 20,
    height: 10,
    rotation: 10,
  };
  const startElements: Element[] = [a, b];
  const ids = new Set(['a', 'b']);
  // The pointer pressed right of the pivot (on screen) and swept a quarter turn clockwise.
  const pivotClient = { x: 500, y: 300 };
  const press = { x: 600, y: 300 };

  it('turns the members from where the gesture began', () => {
    const out = resolveBoxedTurn({
      startElements,
      ids,
      pivotClient,
      pressClient: press,
      client: { x: 500, y: 400 },
      shiftHeld: false,
    });
    expect(out.get('a')!).toMatchObject({ rotation: 90 });
    expect(out.get('b')!).toMatchObject({ rotation: 100 });
  });

  it('snaps the reference member to 15° steps with Shift', () => {
    // 50° clockwise: a lands on 45, b keeps its 10° offset.
    const r = (50 * Math.PI) / 180;
    const out = resolveBoxedTurn({
      startElements: [b, a],
      ids,
      pivotClient,
      pressClient: press,
      client: { x: 500 + 100 * Math.cos(r), y: 300 + 100 * Math.sin(r) },
      shiftHeld: true,
    });
    expect(ROTATE_SNAP_DEGREES).toBe(15);
    expect(out.get('b')!).toMatchObject({ rotation: 60 });
    expect(out.get('a')!).toMatchObject({ rotation: 50 });
  });

  it('gives the members as they began until the sweep reaches a whole degree', () => {
    const out = resolveBoxedTurn({
      startElements,
      ids,
      pivotClient,
      pressClient: press,
      client: { x: 600, y: 300.3 },
      shiftHeld: false,
    });
    expect(out.get('a')).toBe(a);
    expect(out.get('b')).toBe(b);
  });
});
