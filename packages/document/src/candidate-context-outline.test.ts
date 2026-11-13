import { describe, expect, it } from 'vitest';
import {
  CONTEXT_LABEL_INSET_PX,
  CONTEXT_PADDING_PX,
  CONTEXT_WOBBLE_PX,
  contextOutline,
  convexHull,
  distanceToPolygon,
  pointInPolygon,
  polygonArea,
} from './candidate-context-outline';

const note = (x: number, y: number) => ({ x, y, width: 200, height: 200 });
// The points the line passes through: each curve's end (its controls may stand a little off the line).
const numbersOf = (path: string) =>
  path
    .split('C')
    .slice(1)
    .flatMap((curve) => curve.replace('Z', '').trim().split(/\s+/).slice(-2).map(Number));

describe('convexHull', () => {
  it('keeps the outermost points, counter-clockwise in screen space, and drops the inner ones', () => {
    const hull = convexHull([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 5, y: 5 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
      { x: 5, y: 0 },
    ]);
    expect(hull).toHaveLength(4);
    expect(polygonArea(hull)).toBe(100);
  });

  it('answers what it was given when there are fewer than three points', () => {
    expect(convexHull([{ x: 1, y: 2 }])).toEqual([{ x: 1, y: 2 }]);
  });
});

describe('pointInPolygon and distanceToPolygon', () => {
  const square = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ];

  it('tells inside from outside', () => {
    expect(pointInPolygon({ x: 50, y: 50 }, square)).toBe(true);
    expect(pointInPolygon({ x: 150, y: 50 }, square)).toBe(false);
  });

  it('is zero inside and the gap to the nearest edge outside', () => {
    expect(distanceToPolygon({ x: 50, y: 50, width: 10, height: 10 }, square)).toBe(0);
    expect(distanceToPolygon({ x: 130, y: 40, width: 10, height: 10 }, square)).toBe(30);
    expect(distanceToPolygon({ x: 103, y: 104, width: 10, height: 10 }, square)).toBe(5);
  });

  it('counts a box round the whole polygon as touching', () => {
    expect(distanceToPolygon({ x: -10, y: -10, width: 200, height: 200 }, square)).toBe(0);
  });

  it('counts a box that straddles an edge as touching', () => {
    expect(distanceToPolygon({ x: 90, y: 40, width: 40, height: 10 }, square)).toBe(0);
  });

  it('measures a box beside a corner by its nearest corner', () => {
    expect(distanceToPolygon({ x: -50, y: 40, width: 20, height: 10 }, square)).toBe(30);
  });
});

describe('contextOutline (docs/specs/021-event-storming/candidate-contexts.md "Its outline, exactly")', () => {
  it('draws nothing for no notes', () => {
    expect(contextOutline('c', [])).toBeNull();
  });

  it('grows the hull of its notes by the padding all round', () => {
    const o = contextOutline('c', [note(0, 0), note(400, 300)])!;
    expect(o.bounds).toEqual({
      x: -CONTEXT_PADDING_PX,
      y: -CONTEXT_PADDING_PX,
      width: 600 + 2 * CONTEXT_PADDING_PX,
      height: 500 + 2 * CONTEXT_PADDING_PX,
    });
    expect(pointInPolygon({ x: 100, y: 100 }, o.polygon)).toBe(true);
    expect(pointInPolygon({ x: 500, y: 400 }, o.polygon)).toBe(true);
  });

  it('wanders no further than the wobble from the padded hull', () => {
    const o = contextOutline('c', [note(0, 0), note(1200, 0)])!;
    const ns = numbersOf(o.path);
    const xs = ns.filter((_, i) => i % 2 === 0);
    const ys = ns.filter((_, i) => i % 2 === 1);
    // Sampled on the padded hull's chords, a sample can sit a hair inside its round; a pixel of slack covers it.
    const slack = CONTEXT_WOBBLE_PX + 1;
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(-CONTEXT_PADDING_PX - slack);
    expect(Math.max(...xs)).toBeLessThanOrEqual(1400 + CONTEXT_PADDING_PX + slack);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(-CONTEXT_PADDING_PX - slack);
    expect(Math.max(...ys)).toBeLessThanOrEqual(200 + CONTEXT_PADDING_PX + slack);
    // ...and it does wander: not every top sample lies on the straight edge.
    expect(new Set(ys.filter((y) => y < 0).map((y) => Math.round(y))).size).toBeGreaterThan(2);
  });

  it('is a closed path, the same for the same context and different for another', () => {
    const rects = [note(0, 0), note(300, 0)];
    const a = contextOutline('ctx-a', rects)!;
    expect(a.path.startsWith('M')).toBe(true);
    expect(a.path.endsWith('Z')).toBe(true);
    expect(contextOutline('ctx-a', rects)!.path).toBe(a.path);
    expect(contextOutline('ctx-b', rects)!.path).not.toBe(a.path);
  });

  it('puts the name on the top edge, in from where it starts', () => {
    const o = contextOutline('c', [note(0, 100), note(400, 100)])!;
    expect(o.label).toEqual({ x: CONTEXT_LABEL_INSET_PX, y: 100 - CONTEXT_PADDING_PX });
  });

  it('finds the top edge above the leftmost note when the notes step down', () => {
    const o = contextOutline('c', [note(0, 0), note(400, 400)])!;
    expect(o.label.x).toBe(CONTEXT_LABEL_INSET_PX);
    expect(o.label.y).toBeCloseTo(-CONTEXT_PADDING_PX, 0);
  });

  it('wraps a single note', () => {
    const o = contextOutline('c', [note(10, 20)])!;
    expect(o.bounds.width).toBe(200 + 2 * CONTEXT_PADDING_PX);
  });
});
