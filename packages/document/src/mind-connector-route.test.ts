import { describe, expect, it } from 'vitest';
import { arrowPathD } from './arrow-path';
import { createPinnedArrow, createShape } from './factories';
import { MIND_CONNECTOR_LOOK, type MindFlow } from './mind-flow';
import {
  finishArrowEnds,
  finishMindConnectorRoute,
  finishRoutedArrow,
  isDefaultMindConnectorLook,
} from './mind-connector-route';
import { svgArrow } from './svg-render-arrows';
import type { Anchor, ArrowElement, Element, ShapeElement } from './index';

// docs/specs/009-elements/mind-node.md "Connectors" and docs/specs/008-canvas/finish.md "Professional":
// a mind map's default curved connectors draw right-angled under Professional, on one shared trunk per
// parent; the bubble flow draws straight spokes; a look picked on a connector wins. docs/specs/009-elements/mind-node.md
// "Halfway between parent and child": elsewhere a curved connector is an S and an angled one a Z, both turning
// halfway between the two ends.

const W = 250;
const H = 80;

const node = (
  id: string,
  x: number,
  y: number,
  parent?: string,
  flow?: MindFlow,
): ShapeElement => ({
  ...createShape('mind-node', x, y),
  id,
  width: W,
  height: H,
  ...(parent ? { mindParentId: parent } : {}),
  ...(flow ? { mindFlow: flow } : {}),
});

const connector = (
  id: string,
  from: string,
  fromAnchor: Anchor,
  to: string,
  toAnchor: Anchor,
): ArrowElement => ({
  ...createPinnedArrow(from, fromAnchor, to, toAnchor),
  id,
  ...MIND_CONNECTOR_LOOK,
});

// A tree as growth lays it out: children 64 px right of the root, stacked 18 px apart.
function tree(): Element[] {
  return [
    node('root', 0, 0),
    node('a', 314, 0, 'root'),
    node('b', 314, 98, 'root'),
    node('c', 314, 196, 'root'),
    connector('ra', 'root', 'e', 'a', 'w'),
    connector('rb', 'root', 'e', 'b', 'w'),
    connector('rc', 'root', 'e', 'c', 'w'),
  ];
}

const arrowOf = (els: Element[], id: string) => els.find((e) => e.id === id) as ArrowElement;

describe('finishMindConnectorRoute', () => {
  it("routes an org chart's connectors as the bracket in every finish (docs/specs/009-elements/org-chart.md)", () => {
    const person = (el: Element) =>
      el.type === 'shape' ? ({ ...el, mindLook: 'person' } as Element) : el;
    const org = tree().map(person);
    expect(finishMindConnectorRoute(arrowOf(org, 'rb'), org, 'flexible')).toEqual(
      finishMindConnectorRoute(arrowOf(tree(), 'rb'), tree(), 'professional'),
    );
    // An ordinary map in the same finish is drawn as the S (docs/specs/009-elements/mind-node.md "Halfway").
    expect(finishMindConnectorRoute(arrowOf(tree(), 'rb'), tree(), 'flexible')).toEqual({
      style: 's-curve',
      corners: [],
    });
  });

  it('draws the default curve as an S in every finish but Professional', () => {
    const els = tree();
    for (const finish of ['flexible', 'sketch', 'marker'] as const) {
      expect(finishMindConnectorRoute(arrowOf(els, 'rb'), els, finish)).toEqual({
        style: 's-curve',
        corners: [],
      });
      const drawn = finishRoutedArrow(arrowOf(els, 'rb'), els, finish);
      expect(drawn.style).toBe('s-curve');
      expect(drawn.arrow.exactStart).toBe(true);
      expect(drawn.arrow.exactEnd).toBe(true);
    }
  });

  it('turns every sibling on one trunk halfway across the gap (tree)', () => {
    const els = tree();
    // Root east face at x 250, children's west faces at 314: trunk x 282.
    expect(finishMindConnectorRoute(arrowOf(els, 'rb'), els, 'professional')).toEqual({
      style: 'angled',
      corners: [
        { x: 282, y: 40 },
        { x: 282, y: 138 },
      ],
    });
    expect(finishMindConnectorRoute(arrowOf(els, 'rc'), els, 'professional')).toEqual({
      style: 'angled',
      corners: [
        { x: 282, y: 40 },
        { x: 282, y: 236 },
      ],
    });
  });

  it('draws a child level with its parent as one straight run', () => {
    const els = tree();
    expect(finishMindConnectorRoute(arrowOf(els, 'ra'), els, 'professional')).toEqual({
      style: 'angled',
      corners: [],
    });
    const drawn = finishRoutedArrow(arrowOf(els, 'ra'), els, 'professional');
    expect(drawn.style).toBe('straight');
    expect(drawn.arrow.arrowStyle).toBe('straight');
    expect(drawn.arrow.curvePoints).toBeUndefined();
  });

  it('keeps the shared trunk when one child sits further out', () => {
    const els = tree().map((e) => (e.id === 'c' ? { ...e, x: 500 } : e));
    const corners = finishMindConnectorRoute(arrowOf(els, 'rc'), els, 'professional')!.corners;
    expect(corners.map((p) => p.x)).toEqual([282, 282]);
  });

  it('puts the trunk on the left for a balanced map’s west branches', () => {
    const els: Element[] = [
      node('root', 0, 0, undefined, 'balanced'),
      node('r', 314, 0, 'root'),
      node('l1', -314, 0, 'root'),
      node('l2', -314, 98, 'root'),
      connector('rl2', 'root', 'w', 'l2', 'e'),
      connector('rr', 'root', 'e', 'r', 'w'),
    ];
    // Root west face at 0, left children's east faces at -64: trunk x -32.
    expect(finishMindConnectorRoute(arrowOf(els, 'rl2'), els, 'professional')!.corners).toEqual([
      { x: -32, y: 40 },
      { x: -32, y: 138 },
    ]);
  });

  it('runs one horizontal bus at mid-gap and drops into each child’s top (downward)', () => {
    const els: Element[] = [
      node('root', 0, 0, undefined, 'downward'),
      node('a', -134, 130, 'root'),
      node('b', 134, 130, 'root'),
      connector('ra', 'root', 's', 'a', 'n'),
      connector('rb', 'root', 's', 'b', 'n'),
    ];
    // Root bottom at y 80, children's tops at 130: bus y 105.
    expect(finishMindConnectorRoute(arrowOf(els, 'ra'), els, 'professional')!.corners).toEqual([
      { x: 125, y: 105 },
      { x: -9, y: 105 },
    ]);
    expect(finishMindConnectorRoute(arrowOf(els, 'rb'), els, 'professional')!.corners).toEqual([
      { x: 125, y: 105 },
      { x: 259, y: 105 },
    ]);
  });

  it('mirrors the bracket for the leftward flow, the trunk west of the root', () => {
    const els: Element[] = [
      node('root', 0, 0, undefined, 'leftward'),
      node('a', -314, -49, 'root'),
      node('b', -314, 49, 'root'),
      connector('ra', 'root', 'w', 'a', 'e'),
      connector('rb', 'root', 'w', 'b', 'e'),
    ];
    // Root's west face at x 0, children's east faces at -64: trunk x -32.
    expect(finishMindConnectorRoute(arrowOf(els, 'ra'), els, 'professional')!.corners).toEqual([
      { x: -32, y: 40 },
      { x: -32, y: -9 },
    ]);
  });

  it('mirrors the bus for the upward flow, rising into each child’s bottom', () => {
    const els: Element[] = [
      node('root', 0, 0, undefined, 'upward'),
      node('a', -134, -130, 'root'),
      node('b', 134, -130, 'root'),
      connector('ra', 'root', 'n', 'a', 's'),
      connector('rb', 'root', 'n', 'b', 's'),
    ];
    // Root top at y 0, children's bottoms at -50: bus y -25.
    expect(finishMindConnectorRoute(arrowOf(els, 'rb'), els, 'professional')!.corners).toEqual([
      { x: 125, y: -25 },
      { x: 259, y: -25 },
    ]);
  });

  it('draws the bubble flow as straight spokes', () => {
    const els: Element[] = [
      node('root', 0, 0, undefined, 'bubble'),
      node('a', 300, 200, 'root'),
      node('aa', 600, 400, 'a'),
      connector('ra', 'root', 'se', 'a', 'nw'),
      connector('a-aa', 'a', 'se', 'aa', 'nw'),
    ];
    expect(finishMindConnectorRoute(arrowOf(els, 'ra'), els, 'professional')).toEqual({
      style: 'straight',
      corners: [],
    });
    // The flow is the root's, however deep the branch.
    expect(finishRoutedArrow(arrowOf(els, 'a-aa'), els, 'professional').style).toBe('straight');
  });

  // A curve leaving one face and entering another bulges sideways, and in a bubble map's fan that passed
  // behind a sibling (#970), so the spokes are straight whatever the finish.
  it('draws bubble spokes straight in every finish, and a bow picked on one still wins', () => {
    const els: Element[] = [
      node('root', 0, 0, undefined, 'bubble'),
      node('a', 300, 200, 'root'),
      connector('ra', 'root', 'se', 'a', 'nw'),
    ];
    for (const finish of ['flexible', 'sketch', 'marker'] as const) {
      expect(finishRoutedArrow(arrowOf(els, 'ra'), els, finish).style).toBe('straight');
    }
    const bowed: ArrowElement = { ...arrowOf(els, 'ra'), curveOffset: { dx: 0, dy: 40 } };
    expect(finishMindConnectorRoute(bowed, els, 'flexible')).toBeNull();
  });

  it('routes a connector drawn child to parent the same way, reversed', () => {
    const els = tree().map((e) => (e.id === 'rb' ? connector('rb', 'b', 'w', 'root', 'e') : e));
    expect(finishMindConnectorRoute(arrowOf(els, 'rb'), els, 'professional')!.corners).toEqual([
      { x: 282, y: 138 },
      { x: 282, y: 40 },
    ]);
  });

  it('falls back to the plain one-elbow angled line when the faces do not face each other', () => {
    const els = tree().map((e) => (e.id === 'rb' ? connector('rb', 'root', 's', 'b', 'w') : e));
    const drawn = finishRoutedArrow(arrowOf(els, 'rb'), els, 'professional');
    expect(drawn.style).toBe('angled');
    expect(drawn.arrow.curvePoints).toBeUndefined();
    // Out of Professional, a re-pinned end is drawn as stored.
    expect(finishMindConnectorRoute(arrowOf(els, 'rb'), els, 'flexible')).toBeNull();
  });

  it('respects a look picked on the connector', () => {
    const els = tree();
    const base = arrowOf(els, 'rb');
    for (const picked of [
      { ...base, arrowStyle: 'straight' as const },
      { ...base, arrowStyle: undefined },
      { ...base, curveOffset: { dx: 0, dy: 20 } },
      { ...base, curvePoints: [{ dx: 5, dy: 5 }] },
      { ...base, arrowStyle: 'angled' as const, elbowOffset: { dx: 10, dy: 0 } },
      { ...base, arrowStyle: 'angled' as const, curvePoints: [{ dx: 5, dy: 5 }] },
    ]) {
      expect(isDefaultMindConnectorLook(picked)).toBe(false);
      for (const finish of ['professional', 'flexible'] as const) {
        expect(finishMindConnectorRoute(picked, els, finish)).toBeNull();
      }
    }
  });

  it('leaves arrows that are not a parent-child connector alone', () => {
    const els = tree();
    const across = connector('ab', 'a', 's', 'b', 'n');
    const toBox = { ...createShape('square', 600, 0), id: 'box' };
    const out = connector('a-box', 'a', 'e', 'box', 'w');
    const all = [...els, across, toBox, out];
    expect(finishMindConnectorRoute(across, all, 'professional')).toBeNull();
    expect(finishMindConnectorRoute(out, all, 'professional')).toBeNull();
  });
});

describe('finishArrowEnds', () => {
  it('starts every routed sibling at the exact anchor, out of the converging fan', () => {
    const els = tree();
    const starts = ['ra', 'rb', 'rc'].map(
      (id) => finishArrowEnds(arrowOf(els, id), els, 'professional').from,
    );
    expect(starts).toEqual([
      { x: 250, y: 40 },
      { x: 250, y: 40 },
      { x: 250, y: 40 },
    ]);
    // Flexible's S leaves the same one point.
    const flexible = ['ra', 'rb', 'rc'].map(
      (id) => finishArrowEnds(arrowOf(els, id), els, 'flexible').from,
    );
    expect(flexible).toEqual(starts);
    // Bowed by hand, they are drawn as stored and the fan spreads the starts apart along the face.
    const bowed = els.map((e) =>
      e.type === 'arrow' ? { ...e, curveOffset: { dx: 0, dy: 10 } } : e,
    );
    const fanned = ['ra', 'rb', 'rc'].map(
      (id) => finishArrowEnds(arrowOf(bowed, id), bowed, 'flexible').from.y,
    );
    expect(new Set(fanned).size).toBe(3);
    expect(finishArrowEnds(arrowOf(bowed, 'rb'), bowed, 'flexible').style).toBe('curved');
  });

  it('draws the bracket as a polyline through the trunk', () => {
    const els = tree();
    const { arrow, from, to } = finishArrowEnds(arrowOf(els, 'rb'), els, 'professional');
    expect(arrow.exactStart).toBe(true);
    expect(arrow.exactEnd).toBe(true);
    expect(
      arrowPathD(
        arrow.arrowStyle!,
        from,
        to,
        arrow.from,
        arrow.to,
        arrow.curveOffset,
        arrow.elbowOffset,
        arrow.curvePoints,
      ),
    ).toBe('M 250 40 L 282 40 L 282 138 L 314 138');
  });
});

describe('svgArrow under a finish', () => {
  it('exports the Professional bracket and the S in Flexible', () => {
    const els = tree();
    const rb = arrowOf(els, 'rb');
    const pro = svgArrow(
      rb,
      els,
      'light',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      'professional',
    );
    expect(pro).toContain('d="M 250 40 L 282 40 L 282 138 L 314 138"');
    // Flexible exports the S, halfway across the gap.
    const flexible = svgArrow(rb, els, 'light');
    expect(flexible).toContain('d="M 250 40 C 282 40 282 138 314 138"');
    // A bowed connector exports its own quadratic.
    const bowed = svgArrow({ ...rb, curveOffset: { dx: 0, dy: 10 } }, els, 'light');
    expect(bowed).toMatch(/d="M [^"]* Q /);
  });

  it("aims the S's heads square into the faces", () => {
    const els = tree();
    const both: ArrowElement = { ...arrowOf(els, 'rb'), arrowEnds: 'both' };
    const svg = svgArrow(both, els, 'light');
    // Each head's wings sit level with its tip on the same x: the head points straight along the face's normal.
    const heads = [...svg.matchAll(/<polygon points="([^"]+)"/g)].map((m) =>
      m[1]!.split(' ').map((p) => p.split(',').map(Number)),
    );
    expect(heads).toHaveLength(2);
    for (const [tip, wingA, wingB] of heads) {
      expect(wingA![0]).toBeCloseTo(wingB![0]!, 6);
      expect(wingA![1]! + wingB![1]!).toBeCloseTo(2 * tip![1]!, 6);
    }
  });
});

describe('a connector turning halfway between parent and child', () => {
  const angled = (els: Element[]) =>
    els.map((e) => (e.type === 'arrow' ? { ...e, arrowStyle: 'angled' as const } : e));
  const corners = (els: Element[], id: string, finish: 'flexible' | 'professional' = 'flexible') =>
    finishMindConnectorRoute(arrowOf(els, id), els, finish);

  it('sticks an angled connector out to halfway, along, then straight in (tree)', () => {
    const els = angled(tree());
    // Root's east face at x 250, the child's west face at 314: halfway is x 282.
    for (const finish of ['flexible', 'sketch', 'marker', 'professional'] as const) {
      expect(finishMindConnectorRoute(arrowOf(els, 'rc'), els, finish)).toEqual({
        style: 'angled',
        corners: [
          { x: 282, y: 40 },
          { x: 282, y: 236 },
        ],
      });
    }
    const { arrow, style, from, to } = finishArrowEnds(arrowOf(els, 'rc'), els, 'flexible');
    expect(style).toBe('angled');
    expect(
      arrowPathD(style, from, to, arrow.from, arrow.to, undefined, undefined, arrow.curvePoints),
    ).toBe('M 250 40 L 282 40 L 282 236 L 314 236');
  });

  it("turns halfway to a child dragged further out, not on its siblings' line", () => {
    const els = tree().map((e) => (e.id === 'c' ? { ...e, x: 500 } : e));
    // Root's east face at 250, the far child's west face at 500: halfway is x 375.
    expect(corners(angled(els), 'rc')!.corners).toEqual([
      { x: 375, y: 40 },
      { x: 375, y: 236 },
    ]);
    const { arrow, style, from, to } = finishArrowEnds(arrowOf(els, 'rc'), els, 'flexible');
    expect(arrowPathD(style, from, to, arrow.from, arrow.to)).toBe(
      'M 250 40 C 375 40 375 236 500 236',
    );
  });

  it('mirrors for the leftward flow, turning west of the root', () => {
    const els: Element[] = [
      node('root', 0, 0, undefined, 'leftward'),
      node('a', -314, 98, 'root'),
      connector('ra', 'root', 'w', 'a', 'e'),
    ];
    expect(corners(angled(els), 'ra')!.corners).toEqual([
      { x: -32, y: 40 },
      { x: -32, y: 138 },
    ]);
    const { arrow, style, from, to } = finishArrowEnds(arrowOf(els, 'ra'), els, 'flexible');
    expect(arrowPathD(style, from, to, arrow.from, arrow.to)).toBe(
      'M 0 40 C -32 40 -32 138 -64 138',
    );
  });

  it('turns halfway down for the downward flow and halfway up for the upward flow', () => {
    const down: Element[] = [
      node('root', 0, 0, undefined, 'downward'),
      node('a', -134, 130, 'root'),
      connector('ra', 'root', 's', 'a', 'n'),
    ];
    expect(corners(angled(down), 'ra')!.corners).toEqual([
      { x: 125, y: 105 },
      { x: -9, y: 105 },
    ]);
    const d = finishArrowEnds(arrowOf(down, 'ra'), down, 'flexible');
    expect(arrowPathD(d.style, d.from, d.to, d.arrow.from, d.arrow.to)).toBe(
      'M 125 80 C 125 105 -9 105 -9 130',
    );
    const up: Element[] = [
      node('root', 0, 0, undefined, 'upward'),
      node('a', 134, -130, 'root'),
      connector('ra', 'root', 'n', 'a', 's'),
    ];
    expect(corners(angled(up), 'ra')!.corners).toEqual([
      { x: 125, y: -25 },
      { x: 259, y: -25 },
    ]);
  });

  it('runs straight into a child level with its parent', () => {
    const els = tree();
    expect(corners(els, 'ra')).toEqual({ style: 'straight', corners: [] });
    expect(finishRoutedArrow(arrowOf(els, 'ra'), els, 'flexible').arrow.arrowStyle).toBe(
      'straight',
    );
    expect(corners(angled(els), 'ra')).toEqual({ style: 'angled', corners: [] });
    expect(finishRoutedArrow(arrowOf(angled(els), 'ra'), angled(els), 'flexible').style).toBe(
      'straight',
    );
  });

  it('draws a child tucked back over its parent as stored', () => {
    // The child's west face (200) sits behind the parent's east face (250): no gap to turn in.
    const els = tree().map((e) => (e.id === 'c' ? { ...e, x: 200 } : e));
    expect(corners(els, 'rc')).toBeNull();
    expect(corners(angled(els), 'rc')).toBeNull();
    // Faces touching leave no gap either.
    const touching = tree().map((e) => (e.id === 'c' ? { ...e, x: 250 } : e));
    expect(corners(touching, 'rc')).toBeNull();
  });

  it('draws an end re-pinned to another face as stored', () => {
    const els = tree().map((e) => (e.id === 'rb' ? connector('rb', 'root', 's', 'b', 'w') : e));
    expect(corners(els, 'rb')).toBeNull();
    expect(corners(angled(els), 'rb')).toBeNull();
    const quarter = tree().map((e) =>
      e.id === 'rb' ? connector('rb', 'root', 'e', 'b', 'wsw') : e,
    );
    expect(corners(quarter, 'rb')).toBeNull();
  });

  it('reverses the corners of a connector drawn child to parent', () => {
    const els = angled(
      tree().map((e) => (e.id === 'rc' ? connector('rc', 'c', 'w', 'root', 'e') : e)),
    );
    expect(corners(els, 'rc')!.corners).toEqual([
      { x: 282, y: 236 },
      { x: 282, y: 40 },
    ]);
  });

  it('keeps an angled bubble spoke between corners as stored', () => {
    const els: Element[] = angled([
      node('root', 0, 0, undefined, 'bubble'),
      node('a', 300, 200, 'root'),
      connector('ra', 'root', 'se', 'a', 'nw'),
    ]);
    expect(corners(els, 'ra')).toBeNull();
  });
});

describe('the Professional bracket at its edges', () => {
  it('keeps the trunk at the nearest child when a sibling sits further out', () => {
    const els = tree().map((e) => (e.id === 'c' ? { ...e, x: 500 } : e));
    expect(finishMindConnectorRoute(arrowOf(els, 'ra'), els, 'professional')).toEqual({
      style: 'angled',
      corners: [],
    });
    expect(finishMindConnectorRoute(arrowOf(els, 'rb'), els, 'professional')!.corners[0]!.x).toBe(
      282,
    );
  });

  it("turns a child tucked back over its parent halfway to it, its siblings' trunk with no gap", () => {
    // Every child's west face at 200, behind the parent's east face at 250: halfway is x 225.
    const els = tree().map((e) => (e.type === 'shape' && e.id !== 'root' ? { ...e, x: 200 } : e));
    expect(finishMindConnectorRoute(arrowOf(els, 'rc'), els, 'professional')!.corners).toEqual([
      { x: 225, y: 40 },
      { x: 225, y: 236 },
    ]);
  });

  it('turns a child tucked up under its parent halfway to it (downward)', () => {
    // The child's top at 60, above the parent's bottom at 80: halfway is y 70.
    const els: Element[] = [
      node('root', 0, 0, undefined, 'downward'),
      node('a', -134, 60, 'root'),
      connector('ra', 'root', 's', 'a', 'n'),
    ];
    expect(finishMindConnectorRoute(arrowOf(els, 'ra'), els, 'professional')!.corners).toEqual([
      { x: 125, y: 70 },
      { x: -9, y: 70 },
    ]);
  });

  it('leaves a connector with a free end alone', () => {
    const els = tree();
    const loose: ArrowElement = { ...arrowOf(els, 'rb'), to: { kind: 'free', x: 400, y: 400 } };
    expect(finishMindConnectorRoute(loose, els, 'professional')).toBeNull();
    expect(finishMindConnectorRoute(loose, els, 'flexible')).toBeNull();
  });
});
