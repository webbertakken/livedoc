import { describe, expect, it } from 'vitest';
import {
  CONTEXT_NAME_CLEARANCE_PX,
  CONTEXT_NAME_MIN_PX,
  CONTEXT_NAME_PX,
  CONTEXT_PADDING_PX,
  CONTEXT_PLATE_H,
  CONTEXT_PLATE_PAD_X,
  CONTEXT_WOBBLE_PX,
  contextNamePlacement,
  contextOutline,
  convexHull,
  distanceToPolygon,
  pointInPolygon,
  polygonArea,
  polygonCentroid,
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

  it('wraps a single note', () => {
    const o = contextOutline('c', [note(10, 20)])!;
    expect(o.bounds.width).toBe(200 + 2 * CONTEXT_PADDING_PX);
  });
});

describe('contextNamePlacement (candidate-contexts.md "The name")', () => {
  const square = (size: number) => [
    { x: 0, y: 0 },
    { x: size, y: 0 },
    { x: size, y: size },
    { x: 0, y: size },
  ];
  // A name 10 characters wide at any size.
  const width = (fontPx: number) => fontPx * 6;

  it('centres the name on the shape’s weighted centre at full size, 100% and closer', () => {
    const tri = [
      { x: 0, y: 0 },
      { x: 900, y: 0 },
      { x: 0, y: 900 },
    ];
    expect(polygonCentroid(tri)).toEqual({ x: 300, y: 300 });
    const p = contextNamePlacement(tri, width, 2);
    expect(p).toMatchObject({ x: 300, y: 300, fontPx: CONTEXT_NAME_PX });
    expect(p.width).toBe(CONTEXT_NAME_PX * 6 + 2 * CONTEXT_PLATE_PAD_X);
    expect(p.height).toBe(CONTEXT_PLATE_H);
  });

  it('grows on the canvas as the board zooms out, keeping its size on screen', () => {
    const p = contextNamePlacement(square(4000), width, 0.25);
    expect(p.fontPx).toBe(CONTEXT_NAME_PX * 4);
    expect(p.height).toBe(CONTEXT_PLATE_H * 4);
  });

  it('shrinks to keep clear of the line in a small shape, down to the least size', () => {
    const fits = contextNamePlacement(square(160), width, 1);
    expect(fits.fontPx).toBeLessThan(CONTEXT_NAME_PX);
    expect(fits.width / 2 + CONTEXT_NAME_CLEARANCE_PX).toBeLessThanOrEqual(80);
    expect(fits.fontPx).toBeGreaterThan(CONTEXT_NAME_MIN_PX);
    expect(contextNamePlacement(square(40), width, 1).fontPx).toBe(CONTEXT_NAME_MIN_PX);
  });

  it('answers the middle of what it was given for a shape with no area', () => {
    expect(
      polygonCentroid([
        { x: 2, y: 4 },
        { x: 6, y: 4 },
      ]),
    ).toEqual({ x: 4, y: 4 });
  });
});
