import { describe, expect, it } from 'vitest';
import { createShape } from './factories';
import { applyMindMoves, planMindGrowth, relayoutMindMap } from './mind-grow';
import {
  autoPositionMindNodes,
  groupMindNodes,
  planMindDrop,
  setMindNumbered,
  ungroupMindNodes,
} from './mind-arrange';
import { isMindTreeTidy, mindGroupBoxes } from './mind-layout';
import type { Element, ShapeElement } from './index';

// docs/specs/009-elements/mind-node.md "A tidy map stays tidy", "Numbered nodes" and "Groups".

const node = (id: string, parent?: string): ShapeElement => ({
  ...createShape('mind-node', 0, 0),
  id,
  width: 200,
  height: 60,
  ...(parent ? { mindParentId: parent } : { mindFlow: 'tree' as const, x: 100, y: 400 }),
});

// r -> a, b, c, d, laid out tidily top to bottom.
function tidy(): Element[] {
  const els: Element[] = [
    node('r'),
    node('a', 'r'),
    node('b', 'r'),
    node('c', 'r'),
    node('d', 'r'),
  ];
  const stacked = els.map((e, i) => ({ ...e, y: i * 100 })) as Element[];
  const fixed = stacked.map((e) => (e.id === 'r' ? { ...e, y: 400 } : e));
  const plan = relayoutMindMap(fixed, 'r')!;
  return applyMindMoves(fixed, plan.moves, plan.reanchored);
}

const get = (els: Element[], id: string) => els.find((e) => e.id === id) as ShapeElement;
const order = (els: Element[], ids = ['a', 'b', 'c', 'd']) =>
  [...ids].sort((p, q) => get(els, p).y - get(els, q).y);
const moved = (els: Element[], id: string, dx: number, dy: number) =>
  els.map((e) =>
    e.id === id ? { ...e, x: (e as ShapeElement).x + dx, y: (e as ShapeElement).y + dy } : e,
  );

describe('planMindDrop', () => {
  it('reorders a node dropped between two siblings, the map still tidy', () => {
    const before = tidy();
    // a dropped between c and d.
    const dy = (get(before, 'c').y + get(before, 'd').y) / 2 - get(before, 'a').y;
    const out = planMindDrop(before, moved(before, 'a', 6, dy), 'a', new Set(['a']));
    expect(out.kind).toBe('reordered');
    expect(order(out.elements)).toEqual(['b', 'c', 'a', 'd']);
    expect(get(out.elements, 'a').mindPlaced).toBeUndefined();
    expect(isMindTreeTidy(out.elements, 'r', 'tree')).toBe(true);
  });

  it('places a node dropped far away by hand, and closes its slot', () => {
    const before = tidy();
    const out = planMindDrop(before, moved(before, 'b', 900, -300), 'b', new Set(['b']));
    expect(out.kind).toBe('placed');
    expect(get(out.elements, 'b')).toMatchObject({
      mindPlaced: true,
      x: get(before, 'b').x + 900,
      y: get(before, 'b').y - 300,
    });
    expect(order(out.elements, ['a', 'c', 'd'])).toEqual(['a', 'c', 'd']);
    expect(get(out.elements, 'c').y - get(out.elements, 'a').y).toBe(60 + 18);
    expect(isMindTreeTidy(out.elements, 'r', 'tree')).toBe(true);
  });

  it('leaves a hand-arranged map alone', () => {
    const before = moved(tidy(), 'd', 500, 0);
    const after = moved(before, 'a', 0, 120);
    expect(planMindDrop(before, after, 'a', new Set(['a']))).toEqual({
      kind: null,
      elements: after,
    });
  });

  it('joins a group when dropped between two of its members, and leaves it when dropped outside', () => {
    const grouped = groupMindNodes(tidy(), new Set(['b', 'c']), 'g');
    const dy = (get(grouped, 'b').y + get(grouped, 'c').y) / 2 - get(grouped, 'a').y;
    const joined = planMindDrop(grouped, moved(grouped, 'a', 0, dy), 'a', new Set(['a']));
    expect(get(joined.elements, 'a').mindGroup).toBe('g');
    expect(order(joined.elements)).toEqual(['b', 'a', 'c', 'd']);

    const out = joined.elements;
    const down = get(out, 'd').y + 40 - get(out, 'b').y;
    const left = planMindDrop(out, moved(out, 'b', 0, down), 'b', new Set(['b']));
    expect(get(left.elements, 'b').mindGroup).toBeUndefined();
    expect(order(left.elements)).toEqual(['a', 'c', 'd', 'b']);
  });

  it('moves a whole group as one block', () => {
    const grouped = groupMindNodes(tidy(), new Set(['a', 'b']), 'g');
    const dy = get(grouped, 'd').y + 50 - get(grouped, 'a').y;
    const after = moved(moved(grouped, 'a', 0, dy), 'b', 0, dy);
    const out = planMindDrop(grouped, after, 'a', new Set(['a', 'b']));
    expect(out.kind).toBe('reordered');
    expect(order(out.elements)).toEqual(['c', 'd', 'a', 'b']);
    expect(get(out.elements, 'a').mindGroup).toBe('g');
  });
});

describe('arranging by hand', () => {
  it('puts a placed node back in the layout', () => {
    const before = tidy();
    const placed = planMindDrop(before, moved(before, 'b', 900, 0), 'b', new Set(['b'])).elements;
    const out = autoPositionMindNodes(placed, new Set(['b']));
    expect(get(out, 'b').mindPlaced).toBeUndefined();
    expect(order(out)).toEqual(['a', 'b', 'c', 'd']);
    expect(isMindTreeTidy(out, 'r', 'tree')).toBe(true);
  });

  it('groups siblings together, one box around them, and ungroups them', () => {
    const out = groupMindNodes(tidy(), new Set(['a', 'c']), 'g');
    expect(order(out)).toEqual(['a', 'c', 'b', 'd']);
    expect(mindGroupBoxes(out)).toHaveLength(1);
    const back = ungroupMindNodes(out, new Set(['c']));
    expect(get(back, 'a').mindGroup).toBeUndefined();
    expect(mindGroupBoxes(back)).toEqual([]);
  });

  it('numbers and unnumbers nodes', () => {
    const on = setMindNumbered(tidy(), new Set(['a', 'b']), true);
    expect(get(on, 'a').mindNumbered).toBe(true);
    const off = setMindNumbered(on, new Set(['a']), false);
    expect(get(off, 'a')).not.toHaveProperty('mindNumbered');
  });

  it('adds Enter on a grouped node to its group', () => {
    const grouped = groupMindNodes(tidy(), new Set(['a', 'b']), 'g');
    const plan = planMindGrowth(grouped, 'b', 'sibling', { node: 'n', arrow: 'na' })!;
    expect(plan.node.mindGroup).toBe('g');
  });
});
