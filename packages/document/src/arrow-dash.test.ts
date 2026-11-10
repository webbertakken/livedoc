import { describe, expect, it } from 'vitest';
import { arrowDashOffset } from './arrow-dash';
import type { ArrowElement } from './index';

// docs/specs/008-canvas/arrow-anchors.md "End at exact anchor": a shared end's dashes are anchored there.

const arrow = (extra: Partial<ArrowElement>): ArrowElement => ({
  id: 'a',
  type: 'arrow',
  arrowStyle: 'straight',
  from: { kind: 'free', x: 0, y: 0 },
  to: { kind: 'free', x: 0, y: 100 },
  ...extra,
});

describe('arrowDashOffset', () => {
  it("puts the pattern's start at the end of a dashed arrow with an exact end", () => {
    // "6 5" repeats every 11: 100 = 9 × 11 + 1, so the pattern is pulled back 10 to start at the end.
    expect(
      arrowDashOffset(
        arrow({ strokeStyle: 'dashed', exactEnd: true }),
        { x: 0, y: 0 },
        { x: 0, y: 100 },
      ),
    ).toBe(10);
    // Two arrows of different lengths into one end are in step there: offset + length is a whole number of periods.
    const at = (len: number) =>
      arrowDashOffset(
        arrow({ strokeStyle: 'dashed', exactEnd: true }),
        { x: 0, y: 0 },
        { x: 0, y: len },
      )!;
    expect((at(37) + 37) % 11).toBeCloseTo(0);
    expect((at(250) + 250) % 11).toBeCloseTo(0);
  });

  it('leaves a solid line, and a dashed one whose end is its own, as they are', () => {
    expect(
      arrowDashOffset(arrow({ exactEnd: true }), { x: 0, y: 0 }, { x: 0, y: 100 }),
    ).toBeUndefined();
    expect(
      arrowDashOffset(arrow({ strokeStyle: 'dashed' }), { x: 0, y: 0 }, { x: 0, y: 100 }),
    ).toBeUndefined();
  });

  it('measures the shape the path is drawn in, not the stored one', () => {
    // A mind connector drawn as the S (docs/specs/009-elements/mind-node.md "Halfway between parent and child")
    // runs longer than its chord, so its pattern is pulled back by a different amount.
    const curved = arrow({
      strokeStyle: 'dashed',
      exactEnd: true,
      arrowStyle: 'curved',
      from: { kind: 'pinned', elementId: 'p', anchor: 'e' },
      to: { kind: 'pinned', elementId: 'c', anchor: 'w' },
    });
    const from = { x: 0, y: 0 };
    const to = { x: 64, y: 196 };
    const drawn = arrowDashOffset(curved, from, to, 's-curve')!;
    expect(drawn).not.toBe(arrowDashOffset(curved, from, to));
    expect(drawn).toBeGreaterThanOrEqual(0);
    expect(drawn).toBeLessThan(11);
  });
});
