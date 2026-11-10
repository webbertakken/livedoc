import { describe, expect, it } from 'vitest';
import { createPinnedArrow, createShape } from './factories';
import { connectMindNodes } from './mind-connect';
import { mindBranchFlowOf, mindSideOf } from './mind-direction';
import {
  MIND_DIRECTION_LABEL,
  mindDirectionChoices,
  setMindDirection,
} from './mind-direction-edit';
import type { MindFlow } from './mind-flow';
import { applyMindMoves, relayoutMindMap } from './mind-grow';
import { isMindTreeTidy, mindNodesInOrder } from './mind-layout';
import type { ArrowElement, Element, ShapeElement } from './index';

// docs/specs/009-elements/mind-node.md "A direction per node" and "Connecting a branch keeps its direction".

const node = (
  id: string,
  parent?: string,
  flow?: MindFlow,
  at: { x?: number; y?: number } = {},
): ShapeElement => ({
  ...createShape('mind-node', at.x ?? 0, at.y ?? 0),
  id,
  width: 100,
  height: 40,
  label: id,
  ...(parent ? { mindParentId: parent } : {}),
  ...(flow ? { mindFlow: flow } : {}),
});
const link = (from: string, to: string): ArrowElement => ({
  ...createPinnedArrow(from, 'e', to, 'w'),
  id: `${from}-${to}`,
});
const get = (els: Element[], id: string) => els.find((e) => e.id === id) as ShapeElement;
const tidy = (els: Element[], id: string): Element[] => {
  const plan = relayoutMindMap(els, id)!;
  return applyMindMoves(els, plan.moves, plan.reanchored);
};
const dress = (arrow: ArrowElement) => arrow;

// A root growing right with two branches, `a` holding two leaves stacked down a column.
function rightMap(): Element[] {
  return tidy(
    [
      node('r', undefined, undefined, { x: 0, y: 0 }),
      node('a', 'r', undefined, { y: 0 }),
      node('b', 'r', undefined, { y: 300 }),
      node('a1', 'a', undefined, { y: 0 }),
      node('a2', 'a', undefined, { y: 100 }),
      link('r', 'a'),
      link('r', 'b'),
      link('a', 'a1'),
      link('a', 'a2'),
    ],
    'r',
  );
}

describe('setMindDirection', () => {
  it("sets a deeper node's own direction and lays its branch out that way, the rest kept", () => {
    const before = rightMap();
    const out = setMindDirection(before, 'a', 'downward');
    expect(get(out, 'a').mindFlow).toBe('downward');
    expect(get(out, 'r').mindFlow).toBeUndefined();
    // `a`'s leaves now sit in a row below it, in the order they read down the column.
    expect(get(out, 'a1').y).toBeGreaterThan(get(out, 'a').y);
    expect(get(out, 'a1').y).toBe(get(out, 'a2').y);
    expect(get(out, 'a1').x).toBeLessThan(get(out, 'a2').x);
    expect(get(out, 'b').x).toBe(get(before, 'b').x);
    expect(isMindTreeTidy(out, 'r', 'tree')).toBe(true);
    // The connectors under `a` now leave its bottom.
    const a1 = out.find((e) => e.id === 'a-a1') as ArrowElement;
    expect(a1.from.kind === 'pinned' && a1.from.anchor).toBe('s');
  });

  it('keeps directions held deeper when the root changes, dropping a child that now matches', () => {
    const els = setMindDirection(setMindDirection(rightMap(), 'a', 'upward'), 'a1', 'leftward');
    const out = setMindDirection(els, 'r', 'upward');
    expect(get(out, 'r').mindFlow).toBe('upward');
    // `a` held the root's new direction: it drops it. `a1` keeps its own.
    expect(get(out, 'a').mindFlow).toBeUndefined();
    expect(get(out, 'a1').mindFlow).toBe('leftward');
    expect(mindBranchFlowOf(out, get(out, 'a'))).toBe('upward');
  });

  it("drops a deeper node's own direction on Auto, so it follows its parent again", () => {
    const els = setMindDirection(rightMap(), 'a', 'upward');
    const out = setMindDirection(els, 'a', null);
    expect(get(out, 'a').mindFlow).toBeUndefined();
    expect(mindBranchFlowOf(out, get(out, 'a'))).toBe('tree');
  });

  it('does nothing for Auto on a root or a root-only flow on a deeper node', () => {
    const els = rightMap();
    expect(setMindDirection(els, 'r', null)).toBe(els);
    expect(setMindDirection(els, 'a', 'balanced')).toBe(els);
    expect(setMindDirection(els, 'missing', 'tree')).toBe(els);
  });

  it('acts on the root in a bubble map, whichever node it was picked on', () => {
    const els = setMindDirection(rightMap(), 'r', 'bubble');
    const out = setMindDirection(els, 'a', 'downward');
    expect(get(out, 'a').mindFlow).toBeUndefined();
    expect(get(out, 'r').mindFlow).toBe('downward');
  });

  it('gives each child its side when a node turns to any direction', () => {
    const out = setMindDirection(rightMap(), 'r', 'any');
    expect(get(out, 'r').mindFlow).toBe('any');
    expect(get(out, 'a').mindFlow).toBe('tree');
    expect(get(out, 'b').mindFlow).toBe('tree');
    expect(isMindTreeTidy(out, 'r', 'any')).toBe(true);
  });

  it('keeps a child that grows any direction itself on its side', () => {
    const els = setMindDirection(rightMap(), 'a', 'any');
    const out = setMindDirection(els, 'r', 'any');
    expect(get(out, 'a').mindFlow).toBe('any');
  });

  it('deals a root turned balanced to both sides', () => {
    const out = setMindDirection(rightMap(), 'r', 'balanced');
    const sides = ['a', 'b'].map((id) => mindSideOf(out, get(out, id)));
    expect(new Set(sides)).toEqual(new Set(['tree', 'leftward']));
  });

  it('keeps the drawn order of a node turned from a column to a row', () => {
    const before = rightMap();
    const out = setMindDirection(before, 'r', 'downward');
    const order = (els: Element[]) => mindNodesInOrder(els, 'r', 'tree').map((n) => n.node.id);
    expect(mindNodesInOrder(out, 'r', 'downward').map((n) => n.node.id)).toEqual(order(before));
  });
});

// Three trees, each its own map: one growing up, one left, one right, and an empty root to join them under.
function fourMaps(): Element[] {
  return [
    ...tidy([node('hub', undefined, undefined, { x: 0, y: 0 })], 'hub'),
    ...tidy(
      [node('up', undefined, 'upward', { x: 0, y: -600 }), node('up1', 'up'), link('up', 'up1')],
      'up',
    ),
    ...tidy(
      [
        node('left', undefined, 'leftward', { x: -600, y: 0 }),
        node('left1', 'left'),
        link('left', 'left1'),
      ],
      'left',
    ),
    ...tidy(
      [
        node('right', undefined, undefined, { x: 600, y: 0 }),
        node('right1', 'right', 'downward'),
        link('right', 'right1'),
      ],
      'right',
    ),
  ];
}
const connect = (els: Element[], from: string, to: string): Element[] =>
  connectMindNodes([...els, link(from, to)], `${from}-${to}`, undefined, dress);

describe('connecting a branch keeps its direction', () => {
  it('gives an empty parent the direction of its first branch, the branch following it', () => {
    const out = connect(fourMaps(), 'hub', 'up');
    expect(get(out, 'hub').mindFlow).toBe('upward');
    expect(get(out, 'up').mindFlow).toBeUndefined();
    expect(get(out, 'up').y).toBeLessThan(get(out, 'hub').y);
    expect(get(out, 'up1').y).toBeLessThan(get(out, 'up').y);
  });

  it('turns the parent to any direction once its branches sit on more than one side', () => {
    const out = connect(connect(fourMaps(), 'hub', 'up'), 'hub', 'left');
    expect(get(out, 'hub').mindFlow).toBe('any');
    expect(get(out, 'up').mindFlow).toBe('upward');
    expect(get(out, 'left').mindFlow).toBe('leftward');
    expect(get(out, 'left').x).toBeLessThan(get(out, 'hub').x);
    expect(get(out, 'left1').x).toBeLessThan(get(out, 'left').x);
    expect(get(out, 'up').y).toBeLessThan(get(out, 'hub').y);
  });

  it('holds three branches in three directions, deeper directions kept', () => {
    const out = connect(connect(connect(fourMaps(), 'hub', 'up'), 'hub', 'left'), 'hub', 'right');
    expect(['up', 'left', 'right'].map((id) => mindSideOf(out, get(out, id)))).toEqual([
      'upward',
      'leftward',
      'tree',
    ]);
    expect(get(out, 'right').x).toBeGreaterThan(get(out, 'hub').x);
    // `right1` grew down under `right`, and still does.
    expect(get(out, 'right1').mindFlow).toBe('downward');
    expect(isMindTreeTidy(out, 'hub', 'any')).toBe(true);
  });

  it('keeps a branch that already goes the parent’s way following it', () => {
    const els = connect(fourMaps(), 'hub', 'right');
    expect(get(els, 'hub').mindFlow).toBe('tree');
    expect(get(els, 'right').mindFlow).toBeUndefined();
  });

  it('keeps a balanced root balanced while its branches sit left and right', () => {
    const els = setMindDirection(connect(fourMaps(), 'hub', 'right'), 'hub', 'balanced');
    const out = connect(els, 'hub', 'left');
    expect(get(out, 'hub').mindFlow).toBe('balanced');
  });

  it('lets a balanced root joined under a parent grow any direction, on the side it is drawn', () => {
    const els = setMindDirection(fourMaps(), 'left', 'balanced');
    const out = connect(els, 'hub', 'left');
    expect(get(out, 'left').mindFlow).toBe('any');
    expect(get(out, 'hub').mindFlow).toBe('leftward');
  });

  it('keeps a bubble map bubble, the branch joining it as it fans', () => {
    const els = setMindDirection(fourMaps(), 'hub', 'bubble');
    const out = connect(els, 'hub', 'up');
    expect(get(out, 'hub').mindFlow).toBe('bubble');
  });

  it('lets a freed branch stand as a root growing the way it did', () => {
    const joined = connect(fourMaps(), 'hub', 'up');
    const arrow = joined.find((e) => e.id === 'hub-up') as ArrowElement;
    const moved: ArrowElement = { ...arrow, to: { kind: 'free', x: 0, y: -900 } };
    const out = connectMindNodes(
      joined.map((e) => (e.id === arrow.id ? moved : e)),
      arrow.id,
      arrow,
      dress,
    );
    expect(get(out, 'up').mindParentId).toBeUndefined();
    expect(get(out, 'up').mindFlow).toBe('upward');
  });
});

describe('mindDirectionChoices', () => {
  it("offers a root the map's seven flows, its own ticked", () => {
    const els = rightMap();
    const { rows, selected } = mindDirectionChoices(els, get(els, 'r'));
    expect(rows.map((r) => MIND_DIRECTION_LABEL[r])).toEqual([
      'Tree',
      'Leftward',
      'Balanced',
      'Downward',
      'Upward',
      'Bubble',
      'Any direction',
    ]);
    expect(selected).toBe('tree');
  });

  it('offers a deeper node Auto and the directions a branch may hold, Auto ticked when it holds none', () => {
    const els = rightMap();
    const { rows, selected } = mindDirectionChoices(els, get(els, 'a'));
    expect(rows).toEqual(['auto', 'tree', 'leftward', 'downward', 'upward', 'any']);
    expect(selected).toBe('auto');
    const held = setMindDirection(els, 'a', 'upward');
    expect(mindDirectionChoices(held, get(held, 'a')).selected).toBe('upward');
  });

  it("offers a bubble map's deeper nodes the root's flows", () => {
    const els = setMindDirection(rightMap(), 'r', 'bubble');
    expect(mindDirectionChoices(els, get(els, 'a')).selected).toBe('bubble');
  });
});

describe('growth and re-anchoring with directions', () => {
  it('places a new child of an any-direction parent in a hand-arranged map on its last child’s side', async () => {
    const { planMindGrowth } = await import('./mind-grow');
    // Untidy: `up` sits off its slot, so growth falls back to free placement.
    const els: Element[] = [
      node('r', undefined, 'any', { x: 0, y: 0 }),
      node('right', 'r', 'tree', { x: 400, y: 300 }),
      node('up', 'r', 'upward', { x: 37, y: -300 }),
      link('r', 'right'),
      link('r', 'up'),
    ];
    const plan = planMindGrowth(els, 'r', 'child', { node: 'n', arrow: 'n-a' })!;
    expect(plan.node.mindFlow).toBe('upward');
    // Above the root, beside `up` rather than against the right-hand branch.
    expect(plan.node.y + plan.node.height).toBeLessThanOrEqual(0);
    expect(plan.node.x).toBeGreaterThan(37);
    const a = plan.arrow!;
    expect([a.from, a.to].map((e) => (e.kind === 'pinned' ? e.anchor : null))).toEqual(['n', 's']);
  });

  it('refuses an element that is not a mind node', () => {
    const els = rightMap();
    expect(setMindDirection(els, 'r-a', 'tree')).toBe(els);
  });
});
