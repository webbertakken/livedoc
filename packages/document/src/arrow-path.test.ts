import { describe, expect, it } from 'vitest';
import {
  catmullRomPathD,
  angledElbow,
  arrowPathD,
  arrowPathMidpoint,
  arrowPathPolyline,
  curveControlPoint,
  angledCornerPoints,
  arrowLabelAnchor,
  projectToArrow,
  sCurveControlPoints,
  type Anchor,
  type Endpoint,
} from './index';

// Free endpoints just carry coordinates — used everywhere a pinned
// anchor would otherwise dictate direction.
const free = (x: number, y: number): Endpoint => ({ kind: 'free', x, y });

describe('arrowPathD', () => {
  it('renders a straight line as a single M…L between the endpoints', () => {
    const d = arrowPathD(
      'straight',
      { x: 10, y: 20 },
      { x: 30, y: 40 },
      free(10, 20),
      free(30, 40),
    );
    expect(d).toBe('M 10 20 L 30 40');
  });

  it('renders an angled connector as M…L…L with one bend', () => {
    // Horizontal-first when |dx| >= |dy| and both ends are free.
    const d = arrowPathD('angled', { x: 0, y: 0 }, { x: 100, y: 40 }, free(0, 0), free(100, 40));
    expect(d).toBe('M 0 0 L 100 0 L 100 40');
  });

  it('renders a curved arrow as a quadratic bezier (M…Q…)', () => {
    const d = arrowPathD('curved', { x: 0, y: 0 }, { x: 100, y: 0 }, free(0, 0), free(100, 0));
    // Control point is perpendicular to the chord midpoint at ¼ the
    // chord length; for a horizontal chord that's straight up/down.
    expect(d).toMatch(/^M 0 0 Q [\d.-]+ [\d.-]+ 100 0$/);
  });

  it('degenerate curved (zero-length chord) falls back to a straight line', () => {
    const d = arrowPathD('curved', { x: 5, y: 5 }, { x: 5, y: 5 }, free(5, 5), free(5, 5));
    expect(d).toBe('M 5 5 L 5 5');
  });
});

describe('arrowPathMidpoint', () => {
  it('returns the chord midpoint for a straight arrow', () => {
    const m = arrowPathMidpoint(
      'straight',
      { x: 0, y: 0 },
      { x: 100, y: 40 },
      free(0, 0),
      free(100, 40),
    );
    expect(m).toEqual({ x: 50, y: 20 });
  });

  it('returns the elbow vertex for an angled arrow', () => {
    // Same horizontal-first heuristic as the path itself, so the
    // elbow sits at (to.x, from.y) for a wider-than-tall connector.
    const m = arrowPathMidpoint(
      'angled',
      { x: 0, y: 0 },
      { x: 100, y: 40 },
      free(0, 0),
      free(100, 40),
    );
    expect(m).toEqual({ x: 100, y: 0 });
  });
});

describe('curveControlPoint', () => {
  it('places the auto-bow perpendicular to the chord at the midpoint when no override is set', () => {
    // 100-wide horizontal chord: auto-bow runs 25 units UP — the default
    // bow side is screen-consistent (upward; rightward for vertical
    // chords) so mirrored chords bow symmetrically.
    const c = curveControlPoint({ x: 0, y: 0 }, { x: 100, y: 0 });
    expect(c).toEqual({ x: 50, y: -25 });
  });

  it('bows mirrored chords to the SAME screen side (a fan curves symmetrically)', () => {
    // Right-going and left-going fan chords both bow upward instead of
    // one up, one down (the reported half-the-fan-curves-wrong bug).
    const right = curveControlPoint({ x: 0, y: 0 }, { x: 100, y: 100 });
    const left = curveControlPoint({ x: 0, y: 0 }, { x: -100, y: 100 });
    expect(right.y).toBeLessThan(50);
    expect(left.y).toBeLessThan(50);
    // A vertical chord bows rightward deterministically.
    const vertical = curveControlPoint({ x: 0, y: 0 }, { x: 0, y: 100 });
    expect(vertical.x).toBeGreaterThan(0);
  });

  it('uses the supplied offset from the chord midpoint when set', () => {
    // Same chord, user has dragged the curve handle 40px right and
    // 60px down from the midpoint. We expect chord-midpoint + offset.
    const c = curveControlPoint({ x: 0, y: 0 }, { x: 100, y: 0 }, { dx: 40, dy: 60 });
    expect(c).toEqual({ x: 90, y: 60 });
  });

  it('uses the elbow-corner control for pinned ends (perpendicular entry)', () => {
    // Fan chord: hub bottom (s) to a child's top (n), down-and-left. The
    // control is the bounding-box corner sharing the head's x and the
    // tail's y — flat exit along the hub's edge, vertical entry into the
    // child, and no ballooning past the endpoints (docs/specs/008-canvas/canvas-and-palette.md).
    const fromEp = { kind: 'pinned', elementId: 'hub', anchor: 's' } as const;
    const toEp = { kind: 'pinned', elementId: 'kid', anchor: 'n' } as const;
    const c = curveControlPoint({ x: 535, y: 175 }, { x: 110, y: 305 }, undefined, fromEp, toEp);
    expect(c).toEqual({ x: 110, y: 175 });
    // A head on a SIDE face (w) transposes: entry horizontal.
    const side = { kind: 'pinned', elementId: 'kid', anchor: 'w' } as const;
    const cSide = curveControlPoint({ x: 0, y: 0 }, { x: 200, y: 120 }, undefined, fromEp, side);
    expect(cSide).toEqual({ x: 0, y: 120 });
    // An aligned pair degenerates to the chord (renders straight), like
    // the middle child of a fan.
    const mid = curveControlPoint({ x: 535, y: 175 }, { x: 535, y: 305 }, undefined, fromEp, toEp);
    expect(mid).toEqual({ x: 535, y: 175 });
  });

  it('keeps the perpendicular auto-bow for free ends and honours a user offset over faces', () => {
    const fromEp = { kind: 'pinned', elementId: 'hub', anchor: 's' } as const;
    const toEp = { kind: 'pinned', elementId: 'kid', anchor: 'n' } as const;
    // Free-to-free: unchanged screen-consistent bow.
    const c = curveControlPoint(
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      undefined,
      free(0, 0),
      free(100, 0),
    );
    expect(c).toEqual({ x: 50, y: -25 });
    // A dragged handle always wins, pinned or not.
    const dragged = curveControlPoint(
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { dx: 40, dy: 60 },
      fromEp,
      toEp,
    );
    expect(dragged).toEqual({ x: 90, y: 60 });
  });

  it('returns the midpoint when the chord has zero length and no override is set', () => {
    // Degenerate case: a curved arrow whose endpoints coincide.
    const c = curveControlPoint({ x: 5, y: 5 }, { x: 5, y: 5 });
    expect(c).toEqual({ x: 5, y: 5 });
  });

  it('threads the override through arrowPathD so the rendered Q goes through the user point', () => {
    const d = arrowPathD('curved', { x: 0, y: 0 }, { x: 100, y: 0 }, free(0, 0), free(100, 0), {
      dx: 40,
      dy: 60,
    });
    expect(d).toBe('M 0 0 Q 90 60 100 0');
  });
});

describe('angledElbow', () => {
  // The elbow handle (docs/specs/008-canvas/canvas-and-palette.md Arrows / Manipulating arrows) lets
  // the user drag the right-angle corner of an angled arrow to a
  // non-default position. The default corner is at (to.x, from.y)
  // for horizontal-first arrows or (from.x, to.y) for vertical-
  // first. `elbowOffset` translates that auto-corner so the user's
  // chosen bend survives endpoint moves: the auto-corner shifts
  // with the endpoints, the offset stays the same.

  it('returns the auto-corner when no offset is set (horizontal-first)', () => {
    // Free endpoints with a longer horizontal-than-vertical chord
    // → horizontal-first → corner sits at (to.x, from.y).
    const elbow = angledElbow({ x: 0, y: 0 }, { x: 100, y: 50 }, free(0, 0), free(100, 50));
    expect(elbow).toEqual({ x: 100, y: 0 });
  });

  it('returns the auto-corner when no offset is set (vertical-first)', () => {
    // Free endpoints with a longer vertical-than-horizontal chord
    // → vertical-first → corner sits at (from.x, to.y).
    const elbow = angledElbow({ x: 0, y: 0 }, { x: 50, y: 100 }, free(0, 0), free(50, 100));
    expect(elbow).toEqual({ x: 0, y: 100 });
  });

  it('translates the auto-corner by elbowOffset when one is supplied', () => {
    // User has dragged the elbow 30px right + 20px down from the
    // auto-corner.
    const elbow = angledElbow({ x: 0, y: 0 }, { x: 100, y: 50 }, free(0, 0), free(100, 50), {
      dx: 30,
      dy: 20,
    });
    expect(elbow).toEqual({ x: 130, y: 20 });
  });

  it('threads the offset through arrowPathD so the rendered L goes through the dragged point', () => {
    // Angled arrow with a custom elbow at (130, 20). The path
    // should read M from L elbow L to.
    const d = arrowPathD(
      'angled',
      { x: 0, y: 0 },
      { x: 100, y: 50 },
      free(0, 0),
      free(100, 50),
      undefined,
      { dx: 30, dy: 20 },
    );
    expect(d).toBe('M 0 0 L 130 20 L 100 50');
  });

  it('keeps arrowPathMidpoint anchored to the user-dragged elbow on angled arrows', () => {
    // The label / midpoint on an angled arrow sits at the elbow.
    // A regression that ignores the offset would put the label
    // back at the auto-corner.
    const mid = arrowPathMidpoint(
      'angled',
      { x: 0, y: 0 },
      { x: 100, y: 50 },
      free(0, 0),
      free(100, 50),
      undefined,
      { dx: 30, dy: 20 },
    );
    expect(mid).toEqual({ x: 130, y: 20 });
  });

  it('threads a smooth spline through multiple curve points (passes through each)', () => {
    const d = arrowPathD(
      'curved',
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      free(0, 0),
      free(100, 0),
      undefined,
      undefined,
      [
        { dx: -20, dy: -30 },
        { dx: 20, dy: 30 },
      ],
    );
    // chord midpoint is (50,0); anchors land at (30,-30) and (70,30).
    expect(d.startsWith('M 0 0')).toBe(true);
    expect(d).toContain('30 -30');
    expect(d).toContain('70 30');
    expect(d.endsWith('100 0')).toBe(true);
  });

  it('catmullRomPathD passes through every input point', () => {
    const d = catmullRomPathD([
      { x: 0, y: 0 },
      { x: 10, y: 20 },
      { x: 30, y: 5 },
    ]);
    expect(d.startsWith('M 0 0')).toBe(true);
    // each cubic segment ends at the next point
    expect(d).toContain('10 20');
    expect(d.endsWith('30 5')).toBe(true);
  });

  // docs/specs/008-canvas/arrow-bending.md "Angled legs stay square": an end pinned to a top edge
  // keeps a vertical last leg however its stored corner drifted.
  it('keeps a pinned end\u2019s leg square when its stored corner has drifted', () => {
    const pinnedTop = { kind: 'pinned', elementId: 'box', anchor: 'n' } as const;
    // Chord (0,0) → (120,100), midpoint (60,50): the stored corner is (117, 0), 3 px left of the
    // head, so drawn as stored the last leg slants. Squared, it sits straight above the head.
    const d = arrowPathD(
      'angled',
      { x: 0, y: 0 },
      { x: 120, y: 100 },
      free(0, 0),
      pinnedTop,
      undefined,
      undefined,
      [{ dx: 57, dy: -50 }],
    );
    expect(d).toBe('M 0 0 L 120 0 L 120 100');
  });

  it('angled with curve points renders a straight polyline through them (stays angled)', () => {
    const d = arrowPathD(
      'angled',
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      free(0, 0),
      free(100, 0),
      undefined,
      undefined,
      [{ dx: 0, dy: -20 }],
    );
    // chord midpoint (50,0); anchor at (50,-20). Polyline, no curve commands.
    expect(d).toBe('M 0 0 L 50 -20 L 100 0');
    expect(d.includes('C')).toBe(false);
    expect(d.includes('Q')).toBe(false);
  });
});

describe('quarter anchors orient curves and elbows by their side (docs/specs/008-canvas/arrow-anchors.md)', () => {
  const pin = (anchor: 'ene' | 'nne' | 'ssw' | 'wsw'): Endpoint => ({
    kind: 'pinned',
    elementId: 'x',
    anchor,
  });
  it('runs an elbow horizontally first from a quarter on a vertical side', () => {
    expect(angledElbow({ x: 0, y: 0 }, { x: 100, y: 50 }, pin('ene'), free(100, 50))).toEqual({
      x: 100,
      y: 0,
    });
    expect(angledElbow({ x: 0, y: 0 }, { x: 100, y: 50 }, pin('wsw'), free(100, 50))).toEqual({
      x: 100,
      y: 0,
    });
  });
  it('runs an elbow vertically first from a quarter on a horizontal side', () => {
    expect(angledElbow({ x: 0, y: 0 }, { x: 100, y: 50 }, pin('nne'), free(100, 50))).toEqual({
      x: 0,
      y: 50,
    });
  });
  it('enters a quarter on a vertical side horizontally', () => {
    expect(
      curveControlPoint({ x: 0, y: 0 }, { x: 100, y: 50 }, undefined, free(0, 0), pin('wsw')),
    ).toEqual({
      x: 0,
      y: 50,
    });
    expect(
      curveControlPoint({ x: 0, y: 0 }, { x: 100, y: 50 }, undefined, free(0, 0), pin('ssw')),
    ).toEqual({
      x: 100,
      y: 0,
    });
  });
});

// docs/specs/009-elements/mind-node.md "Halfway between parent and child": the S a mind connector is drawn
// with leaves one face square, turns through the point halfway between its ends, and enters the other square.
describe('the s-curve', () => {
  const pinned = (elementId: string, anchor: Anchor): Endpoint => ({
    kind: 'pinned',
    elementId,
    anchor,
  });
  const east = pinned('parent', 'e');
  const west = pinned('child', 'w');

  it('turns halfway along the leaving axis for side faces', () => {
    const from = { x: 250, y: 40 };
    const to = { x: 314, y: 236 };
    expect(sCurveControlPoints(from, to, east, west)).toEqual([
      { x: 282, y: 40 },
      { x: 282, y: 236 },
    ]);
    expect(arrowPathD('s-curve', from, to, east, west)).toBe('M 250 40 C 282 40 282 236 314 236');
  });

  it('turns halfway down for a bottom face into a top face', () => {
    const from = { x: 125, y: 80 };
    const to = { x: -9, y: 130 };
    expect(sCurveControlPoints(from, to, pinned('parent', 's'), pinned('child', 'n'))).toEqual([
      { x: 125, y: 105 },
      { x: -9, y: 105 },
    ]);
  });

  it('runs along the longer axis between free ends', () => {
    expect(
      sCurveControlPoints({ x: 0, y: 0 }, { x: 20, y: 100 }, free(0, 0), free(20, 100)),
    ).toEqual([
      { x: 0, y: 50 },
      { x: 20, y: 50 },
    ]);
  });

  it('passes through the chord midpoint, its halves mirrored about it', () => {
    const from = { x: 250, y: 40 };
    const to = { x: 314, y: 236 };
    expect(arrowPathMidpoint('s-curve', from, to, east, west)).toEqual({ x: 282, y: 138 });
    const pts = arrowPathPolyline('s-curve', from, to, east, west);
    expect(pts[0]).toEqual(from);
    expect(pts[pts.length - 1]).toEqual(to);
    expect(pts[(pts.length - 1) / 2]).toEqual({ x: 282, y: 138 });
    for (let i = 0; i < pts.length; i++) {
      const mirror = pts[pts.length - 1 - i]!;
      expect(pts[i]!.x + mirror.x).toBeCloseTo(from.x + to.x, 9);
      expect(pts[i]!.y + mirror.y).toBeCloseTo(from.y + to.y, 9);
    }
  });

  it('leaves and enters square to the faces, never doubling back', () => {
    const from = { x: 250, y: 40 };
    const to = { x: 314, y: 236 };
    const pts = arrowPathPolyline('s-curve', from, to, east, west);
    // The first and last steps run (almost) flat, and x only ever grows: no C bulging back along an edge.
    expect(Math.abs(pts[1]!.y - pts[0]!.y)).toBeLessThan(Math.abs(pts[1]!.x - pts[0]!.x));
    const n = pts.length - 1;
    expect(Math.abs(pts[n]!.y - pts[n - 1]!.y)).toBeLessThan(Math.abs(pts[n]!.x - pts[n - 1]!.x));
    for (let i = 1; i < pts.length; i++) expect(pts[i]!.x).toBeGreaterThanOrEqual(pts[i - 1]!.x);
  });
});

describe('a pinned tail with a free head', () => {
  const tail = (anchor: Anchor): Endpoint => ({ kind: 'pinned', elementId: 'a', anchor });

  it('leaves the tail square to its face', () => {
    const from = { x: 0, y: 0 };
    const to = { x: 100, y: 60 };
    // A bottom face leaves downwards, a side face sideways.
    expect(curveControlPoint(from, to, undefined, tail('s'), free(100, 60))).toEqual({
      x: 0,
      y: 60,
    });
    expect(curveControlPoint(from, to, undefined, tail('e'), free(100, 60))).toEqual({
      x: 100,
      y: 0,
    });
  });

  it('lets a pinned head pick the first leg when the tail is free', () => {
    const head = (anchor: Anchor): Endpoint => ({ kind: 'pinned', elementId: 'b', anchor });
    // Into a top face the last leg runs down, so the first runs across; into a side, the reverse.
    expect(angledElbow({ x: 0, y: 0 }, { x: 40, y: 100 }, free(0, 0), head('n'))).toEqual({
      x: 40,
      y: 0,
    });
    expect(angledElbow({ x: 0, y: 0 }, { x: 100, y: 40 }, free(0, 0), head('w'))).toEqual({
      x: 0,
      y: 40,
    });
  });
});

describe('multi-bend paths', () => {
  const from = { x: 0, y: 0 };
  const to = { x: 100, y: 0 };

  it('has no corners to square without bend points', () => {
    expect(angledCornerPoints(from, to, [])).toEqual([]);
  });

  it('draws nothing for a lone point and a line for two', () => {
    expect(catmullRomPathD([{ x: 1, y: 2 }])).toBe('');
    expect(catmullRomPathD([from, to])).toBe('M 0 0 L 100 0');
  });

  it('finds the middle of an angled polyline and of a spline by length along them', () => {
    // Corners at (50, 0) and (50, 40) of a chord to (100, 40): the polyline runs 50 + 40 + 50, so its middle
    // is 70 along it, 20 down the middle leg.
    const bends = [
      { dx: 0, dy: -20 },
      { dx: 0, dy: 20 },
    ];
    expect(
      arrowPathMidpoint(
        'angled',
        from,
        { x: 100, y: 40 },
        free(0, 0),
        free(100, 40),
        undefined,
        undefined,
        bends,
      ),
    ).toEqual({
      x: 50,
      y: 20,
    });
    // A spline through one point straight above the chord's middle is symmetric: its middle is that point.
    const mid = arrowPathMidpoint(
      'curved',
      from,
      to,
      free(0, 0),
      free(100, 0),
      undefined,
      undefined,
      [{ dx: 0, dy: -30 }],
    );
    expect(mid.x).toBeCloseTo(50, 9);
    expect(mid.y).toBeCloseTo(-30, 9);
  });

  it('samples a spline through its points', () => {
    const pts = arrowPathPolyline(
      'curved',
      from,
      to,
      free(0, 0),
      free(100, 0),
      undefined,
      undefined,
      [{ dx: 0, dy: -30 }],
    );
    expect(pts[0]).toEqual(from);
    expect(pts).toContainEqual({ x: 50, y: -30 });
    expect(pts[pts.length - 1]).toEqual(to);
  });

  it("takes a bow's middle on a single-bow curve", () => {
    const c = curveControlPoint(from, to, undefined, free(0, 0), free(100, 0));
    expect(arrowPathMidpoint('curved', from, to, free(0, 0), free(100, 0))).toEqual({
      x: 0.25 * from.x + 0.5 * c.x + 0.25 * to.x,
      y: 0.25 * from.y + 0.5 * c.y + 0.25 * to.y,
    });
  });
});

describe('arrowLabelAnchor', () => {
  const from = { x: 0, y: 0 };
  const to = { x: 100, y: 0 };

  it('sits on the midpoint with no placement stored', () => {
    expect(
      arrowLabelAnchor(
        'straight',
        from,
        to,
        free(0, 0),
        free(100, 0),
        undefined,
        undefined,
        undefined,
      ),
    ).toEqual({
      x: 50,
      y: 0,
    });
  });

  it('sits on the start of a zero-length arrow', () => {
    expect(
      arrowLabelAnchor('straight', from, from, free(0, 0), free(0, 0), undefined, undefined, {
        t: 0.5,
        offset: 0,
      }),
    ).toEqual(from);
  });

  it('steps over a zero-length leg', () => {
    // The elbow dragged onto the start leaves a zero-length first leg: t 0 sits on it, with no direction to
    // offset along.
    const onStart = { dx: -100, dy: 0 };
    expect(
      arrowLabelAnchor(
        'angled',
        from,
        { x: 100, y: 40 },
        free(0, 0),
        free(100, 40),
        undefined,
        onStart,
        {
          t: 0,
          offset: 5,
        },
      ),
    ).toEqual({ x: 0, y: 0 });
  });
});

describe('projectToArrow', () => {
  const from = { x: 0, y: 0 };
  const to = { x: 100, y: 0 };

  it('puts a point left of travel positive and right of it negative', () => {
    expect(
      projectToArrow('straight', from, to, free(0, 0), free(100, 0), undefined, undefined, {
        x: 25,
        y: 10,
      }),
    ).toEqual({
      t: 0.25,
      offset: 10,
    });
    expect(
      projectToArrow('straight', from, to, free(0, 0), free(100, 0), undefined, undefined, {
        x: 25,
        y: -10,
      }),
    ).toEqual({
      t: 0.25,
      offset: -10,
    });
  });

  it('projects onto the nearest leg of an angled arrow, over a zero-length one', () => {
    // Elbow on the start: a zero-length first leg, then the whole run. The point lies nearest that run.
    const onStart = { dx: -100, dy: 0 };
    const placed = projectToArrow(
      'angled',
      from,
      { x: 100, y: 40 },
      free(0, 0),
      free(100, 40),
      undefined,
      onStart,
      {
        x: 50,
        y: 10,
      },
    );
    expect(placed.t).toBeGreaterThan(0);
    expect(placed.t).toBeLessThan(1);
    // The elbow at its corner: the point is nearest the first leg, not the second.
    const corner = projectToArrow(
      'angled',
      from,
      { x: 100, y: 40 },
      free(0, 0),
      free(100, 40),
      undefined,
      undefined,
      {
        x: 30,
        y: 5,
      },
    );
    expect(corner.t).toBeCloseTo(30 / 140, 9);
  });

  it('places everything at the start of a zero-length arrow', () => {
    expect(
      projectToArrow('straight', from, from, free(0, 0), free(0, 0), undefined, undefined, {
        x: 5,
        y: 5,
      }),
    ).toEqual({
      t: 0,
      offset: 0,
    });
  });
});
