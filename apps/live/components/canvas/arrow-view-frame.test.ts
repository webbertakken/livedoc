import { describe, expect, it } from 'vitest';
import {
  buildElementGrid,
  buildElementIndex,
  createPinnedArrow,
  createShape,
  MIND_CONNECTOR_LOOK,
} from '@livedoc/document';
import {
  arrowViewGeometry,
  deriveArrowViewFrame,
  sameArrowViewFrame,
  sameRects,
} from './arrow-view-frame';

// docs/specs/008-canvas/canvas-performance.md: an arrow view re-renders only when its own frame or
// holes change, so both compare by value.

const a = createShape('square', 0, 0);
const b = createShape('square', 400, 0);
const arrow = createPinnedArrow(a.id, 'e', b.id, 'w');

describe('sameArrowViewFrame', () => {
  it('treats a freshly derived equal frame as the same', () => {
    const index = buildElementIndex([a, b, arrow]);
    expect(
      sameArrowViewFrame(deriveArrowViewFrame(arrow, index), deriveArrowViewFrame(arrow, index)),
    ).toBe(true);
  });

  it("anchors a shared end's dashes there, and sees the offset change", () => {
    const bus = { ...arrow, strokeStyle: 'dashed' as const, exactEnd: true };
    const frame = deriveArrowViewFrame(bus, buildElementIndex([a, b, bus]));
    expect(frame.dashOffset).toBeTypeOf('number');
    expect(
      deriveArrowViewFrame(arrow, buildElementIndex([a, b, arrow])).dashOffset,
    ).toBeUndefined();
    expect(sameArrowViewFrame(frame, { ...frame, dashOffset: frame.dashOffset! + 1 })).toBe(false);
  });

  it('sees an end that moved', () => {
    const before = deriveArrowViewFrame(arrow, buildElementIndex([a, b, arrow]));
    const after = deriveArrowViewFrame(arrow, buildElementIndex([a, { ...b, y: 30 }, arrow]));
    expect(sameArrowViewFrame(before, after)).toBe(false);
  });
});

describe('deriveArrowViewFrame handles', () => {
  const frameOf = (extra: Partial<typeof arrow>) => {
    const shaped = { ...arrow, ...extra };
    return deriveArrowViewFrame(shaped, buildElementIndex([a, b, shaped]));
  };

  it('offers a handle per bend point, squared on an angled line', () => {
    const bends = [{ dx: 0, dy: 60 }];
    const curved = frameOf({ arrowStyle: 'curved', curvePoints: bends });
    expect(curved.curveAnchors).toHaveLength(1);
    expect(curved.curveControl).toBeNull();
    const angled = frameOf({ arrowStyle: 'angled', curvePoints: bends });
    expect(angled.curveAnchors).toHaveLength(1);
    expect(angled.elbowPoint).toBeNull();
  });

  it('offers the elbow on an angled line with no bend points, and nothing on a straight one', () => {
    expect(frameOf({ arrowStyle: 'angled' }).elbowPoint).not.toBeNull();
    expect(frameOf({ arrowStyle: 'angled', curvePoints: [] }).curveAnchors).toBeNull();
    const straight = frameOf({ arrowStyle: 'straight' });
    expect([straight.curveAnchors, straight.curveControl, straight.elbowPoint]).toEqual([
      null,
      null,
      null,
    ]);
  });

  it('sees a bend point that moved, and one more or fewer', () => {
    const one = frameOf({ arrowStyle: 'curved', curvePoints: [{ dx: 0, dy: 60 }] });
    const moved = frameOf({ arrowStyle: 'curved', curvePoints: [{ dx: 0, dy: 70 }] });
    const two = frameOf({
      arrowStyle: 'curved',
      curvePoints: [
        { dx: 0, dy: 60 },
        { dx: 20, dy: 60 },
      ],
    });
    expect(sameArrowViewFrame(one, { ...one, curveAnchors: [...one.curveAnchors!] })).toBe(true);
    expect(sameArrowViewFrame(one, { ...moved, pathD: one.pathD, midpoint: one.midpoint })).toBe(
      false,
    );
    expect(sameArrowViewFrame(one, { ...one, curveAnchors: two.curveAnchors })).toBe(false);
    expect(sameArrowViewFrame(one, { ...one, curveAnchors: null })).toBe(false);
  });
});

describe('arrowViewGeometry', () => {
  it('breaks the line around a box in its way, found through the grid', () => {
    const between = { ...createShape('square', 200, -20), fillColor: '#ffffff' };
    const els = [a, b, between, arrow];
    const { holes } = arrowViewGeometry(arrow, buildElementIndex(els), buildElementGrid(els));
    expect(holes).toHaveLength(1);
  });

  it('compares holes by value', () => {
    const r = { x: 1, y: 2, width: 3, height: 4 };
    expect(sameRects([r], [{ ...r }])).toBe(true);
    expect(sameRects([r], [{ ...r, x: 2 }])).toBe(false);
    expect(sameRects([], [r])).toBe(false);
  });
});

// docs/specs/009-elements/mind-node.md "Connectors": under Professional a mind connector draws on the
// map's bracket, and offers no bow or elbow handle, since the stored arrow has no such bend.
describe('deriveArrowViewFrame in a finish', () => {
  const root = { ...createShape('mind-node', 0, 0), id: 'root', width: 250, height: 80 };
  const kid = {
    ...createShape('mind-node', 314, 98),
    id: 'kid',
    width: 250,
    height: 80,
    mindParentId: 'root',
  };
  const link = {
    ...createPinnedArrow('root', 'e', 'kid', 'w'),
    ...MIND_CONNECTOR_LOOK,
  };
  const index = buildElementIndex([root, kid, link]);

  it('draws the Professional bracket with no handles', () => {
    const frame = deriveArrowViewFrame(link, index, 'professional');
    expect(frame.style).toBe('angled');
    expect(frame.pathD).toBe('M 250 40 L 282 40 L 282 138 L 314 138');
    expect(frame.curveAnchors).toBeNull();
    expect(frame.curveControl).toBeNull();
    expect(frame.elbowPoint).toBeNull();
  });

  // docs/specs/009-elements/mind-node.md "Halfway between parent and child".
  it('draws the S turning halfway in Flexible, with no handles', () => {
    const frame = deriveArrowViewFrame(link, index);
    expect(frame.style).toBe('s-curve');
    expect(frame.pathD).toBe('M 250 40 C 282 40 282 138 314 138');
    expect(frame.midpoint).toEqual({ x: 282, y: 89 });
    expect(frame.curveAnchors).toBeNull();
    expect(frame.curveControl).toBeNull();
    expect(frame.elbowPoint).toBeNull();
  });

  it('draws an angled connector as the Z turning halfway, with no elbow handle', () => {
    const angled = { ...link, arrowStyle: 'angled' as const };
    const frame = deriveArrowViewFrame(angled, buildElementIndex([root, kid, angled]));
    expect(frame.pathD).toBe('M 250 40 L 282 40 L 282 138 L 314 138');
    expect(frame.elbowPoint).toBeNull();
  });

  it('keeps a bowed connector and its handle', () => {
    const bowed = { ...link, curveOffset: { dx: 0, dy: 20 } };
    const frame = deriveArrowViewFrame(bowed, buildElementIndex([root, kid, bowed]));
    expect(frame.style).toBe('curved');
    expect(frame.curveControl).not.toBeNull();
  });

  it('sees the dash offset of the S as drawn', () => {
    const dashed = { ...link, strokeStyle: 'dashed' as const };
    const frame = deriveArrowViewFrame(dashed, buildElementIndex([root, kid, dashed]));
    expect(frame.dashOffset).toBeTypeOf('number');
  });
});
