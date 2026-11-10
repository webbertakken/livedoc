import { describe, expect, it } from 'vitest';
import { applyArrowBend } from './arrow-bend';
import { arrowPathPolyline, sCurvePoint } from './arrow-path';
import { createPinnedArrow, createShape } from './factories';
import { planArrowBendInFinish } from './mind-connector-bend';
import { finishArrowEnds } from './mind-connector-route';
import { MIND_CONNECTOR_LOOK } from './mind-flow';
import type { ArrowElement, Element, ShapeElement } from './index';

// docs/specs/009-elements/mind-node.md "Halfway between parent and child": dragging a drawn connector's line bends
// it from the shape it is drawn as, its ends kept where they are drawn; the Professional bracket of a stored curve
// does not bend.

const node = (id: string, x: number, y: number, parent?: string): ShapeElement => ({
  ...createShape('mind-node', x, y),
  id,
  width: 250,
  height: 80,
  ...(parent ? { mindParentId: parent } : {}),
});

const connector = (id: string, from: string, to: string, extra: Partial<ArrowElement> = {}) => ({
  ...createPinnedArrow(from, 'e', to, 'w'),
  id,
  ...MIND_CONNECTOR_LOOK,
  ...extra,
});

// A root and three children stacked down its right: the connectors share the root's east anchor, so they fan
// when drawn as stored.
function tree(extra: Partial<ArrowElement> = {}): Element[] {
  return [
    node('root', 0, 0),
    node('a', 314, 0, 'root'),
    node('b', 314, 98, 'root'),
    node('c', 314, 196, 'root'),
    connector('ra', 'root', 'a', extra),
    connector('rb', 'root', 'b', extra),
    connector('rc', 'root', 'c', extra),
  ];
}

const arrowOf = (els: Element[], id: string) => els.find((e) => e.id === id) as ArrowElement;

// The arrow once the plan is applied for `delta`, as the board stores it.
const bent = (
  els: Element[],
  id: string,
  grab: { x: number; y: number },
  delta = { x: 0, y: 0 },
) => {
  const plan = planArrowBendInFinish(arrowOf(els, id), els, 'flexible', grab)!;
  return { plan, arrow: { ...arrowOf(els, id), ...applyArrowBend(plan, delta) } as ArrowElement };
};

describe('planArrowBendInFinish', () => {
  it('does not bend the Professional bracket of a stored curve', () => {
    const els = tree();
    expect(
      planArrowBendInFinish(arrowOf(els, 'rc'), els, 'professional', { x: 282, y: 138 }),
    ).toBeNull();
  });

  it('slides the grabbed segment of a Z, its ends kept on the shared point', () => {
    const els = tree({ arrowStyle: 'angled' });
    // The Z runs 250,40 -> 282,40 -> 282,236 -> 314,236; grab its middle leg and slide it 30 right.
    const { plan, arrow } = bent(els, 'rc', { x: 282, y: 138 }, { x: 30, y: 0 });
    expect(plan.kind).toBe('slide');
    expect(arrow.exactStart).toBe(true);
    expect(arrow.exactEnd).toBe(true);
    const drawn = finishArrowEnds(
      arrow,
      els.map((e) => (e.id === 'rc' ? arrow : e)),
      'flexible',
    );
    expect(drawn.style).toBe('angled');
    expect(
      arrowPathPolyline(
        'angled',
        drawn.from,
        drawn.to,
        arrow.from,
        arrow.to,
        undefined,
        undefined,
        arrow.curvePoints,
      ),
    ).toEqual([
      { x: 250, y: 40 },
      { x: 312, y: 40 },
      { x: 312, y: 236 },
      { x: 314, y: 236 },
    ]);
  });

  it('bends an S through the point grabbed, between its shoulders, its ends kept', () => {
    const els = tree();
    const from = { x: 250, y: 40 };
    const to = { x: 314, y: 236 };
    const fromEp = arrowOf(els, 'rc').from;
    const toEp = arrowOf(els, 'rc').to;
    const middle = { x: 282, y: 138 };
    const { plan, arrow } = bent(els, 'rc', middle, { x: 0, y: 20 });
    expect(plan.kind).toBe('insert');
    expect(arrow.arrowStyle).toBe('curved');
    expect(arrow.exactStart).toBe(true);
    expect(arrow.exactEnd).toBe(true);
    // Through the S's shoulders (a quarter and three quarters along it) and the dragged middle.
    const at = (p: { x: number; y: number }) => ({ dx: p.x - middle.x, dy: p.y - middle.y });
    const [q1, q3] = [
      sCurvePoint(from, to, fromEp, toEp, 0.25),
      sCurvePoint(from, to, fromEp, toEp, 0.75),
    ];
    expect(arrow.curvePoints).toEqual([at(q1), { dx: 0, dy: 20 }, at(q3)]);
  });

  it('bends a connector drawn as stored from the stored arrow, its ends as they were', () => {
    const els = tree({ curveOffset: { dx: 0, dy: 10 } });
    const { arrow } = bent(els, 'rb', { x: 282, y: 89 }, { x: 0, y: 10 });
    expect(arrow.exactStart).toBeUndefined();
    expect(arrow.exactEnd).toBeUndefined();
  });

  it("bows a bubble map's straight spoke from the stored arrow", () => {
    const els: Element[] = [
      { ...node('root', 0, 0), mindFlow: 'bubble' },
      node('a', 300, 200, 'root'),
      { ...createPinnedArrow('root', 'se', 'a', 'nw'), id: 'ra', ...MIND_CONNECTOR_LOOK },
    ];
    const plan = planArrowBendInFinish(arrowOf(els, 'ra'), els, 'flexible', { x: 275, y: 140 })!;
    expect(plan.exactEnds).toBeUndefined();
  });
});
