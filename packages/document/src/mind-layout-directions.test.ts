import { describe, expect, it } from 'vitest';
import { createShape } from './factories';
import { MIND_CHILD_GAP_X, MIND_CHILD_GAP_Y, type MindFlow } from './mind-flow';
import {
  MIND_GROUP_PADDING,
  isMindTreeTidy,
  layoutMindTree,
  mindNodesInOrder,
  reanchorMindConnectors,
} from './mind-layout';
import type { Element, ShapeElement } from './index';

// docs/specs/009-elements/mind-node.md "A direction per node": each branch is laid out on the side its direction
// puts it, and grows its own way from there.

const W = 100;
const H = 40;
const node = (
  id: string,
  parent?: string,
  flow?: MindFlow,
  at: { x?: number; y?: number } = {},
  extra: Partial<ShapeElement> = {},
): ShapeElement => ({
  ...createShape('mind-node', at.x ?? 0, at.y ?? 0),
  id,
  width: W,
  height: H,
  ...(parent ? { mindParentId: parent } : {}),
  ...(flow ? { mindFlow: flow } : {}),
  ...extra,
});

const apply = (els: Element[], layout: Map<string, { x: number; y: number }>): Element[] =>
  els.map((el) => (layout.has(el.id) ? { ...el, ...layout.get(el.id)! } : el));
const box = (els: Element[], id: string) => els.find((e) => e.id === id) as ShapeElement;
const laid = (els: Element[]) => {
  const root = els.find((e): e is ShapeElement => e.type === 'shape' && !e.mindParentId)!;
  const flow: MindFlow = root.mindFlow ?? 'tree';
  return apply(els, layoutMindTree(els, root.id, flow));
};

// Three branches off one root, one up, one left and one right, each with a child of its own.
const threeWays = (): Element[] => [
  node('r', undefined, 'any', { x: 0, y: 0 }),
  node('up', 'r', 'upward', { y: -500 }),
  node('left', 'r', 'leftward', { x: -500 }),
  node('right', 'r', 'tree', { x: 500 }),
  node('up1', 'up'),
  node('left1', 'left'),
  node('right1', 'right'),
];

describe('layoutMindTree with a direction per node', () => {
  it('lays three branches of one root out up, left and right, each growing its own way', () => {
    const out = laid(threeWays());
    // Up: centred above the root by the level gap, its child above it.
    expect(box(out, 'up')).toMatchObject({ x: 0, y: -H - MIND_CHILD_GAP_Y });
    expect(box(out, 'up1')).toMatchObject({ x: 0, y: -2 * (H + MIND_CHILD_GAP_Y) });
    // Left and right: level with the root, a child gap out, their children further out.
    expect(box(out, 'left')).toMatchObject({ x: -W - MIND_CHILD_GAP_X, y: 0 });
    expect(box(out, 'left1')).toMatchObject({ x: -2 * (W + MIND_CHILD_GAP_X), y: 0 });
    expect(box(out, 'right')).toMatchObject({ x: W + MIND_CHILD_GAP_X, y: 0 });
    expect(box(out, 'right1')).toMatchObject({ x: 2 * (W + MIND_CHILD_GAP_X), y: 0 });
    expect(isMindTreeTidy(out, 'r', 'any')).toBe(true);
  });

  it('lets a branch grow its own way under a one-direction root, its box taking the room', () => {
    // The root grows right; `a` grows up, with three children in a row above it.
    const els: Element[] = [
      node('r', undefined, undefined, { x: 0, y: 0 }),
      node('a', 'r', 'upward'),
      node('b', 'r'),
      node('a1', 'a'),
      node('a2', 'a'),
      node('a3', 'a'),
    ];
    const out = laid(els);
    const a = box(out, 'a');
    // The row above `a` is wider than `a`, so `a` steps out until the row clears the root.
    const row = ['a1', 'a2', 'a3'].map((id) => box(out, id));
    expect(Math.min(...row.map((n) => n.x))).toBe(W + MIND_CHILD_GAP_X);
    expect(row.every((n) => n.y === a.y - H - MIND_CHILD_GAP_Y)).toBe(true);
    // `b` stacks below `a`'s whole branch, not just `a`.
    expect(box(out, 'b').y).toBeGreaterThanOrEqual(a.y + H);
    expect(box(out, 'b').x).toBe(W + MIND_CHILD_GAP_X);
    expect(isMindTreeTidy(out, 'r', 'tree')).toBe(true);
  });

  it('steps a leftward branch under a rightward parent out past its own reach back', () => {
    const els: Element[] = [
      node('r', undefined, undefined, { x: 0, y: 0 }),
      node('a', 'r', 'leftward'),
      node('a1', 'a'),
    ];
    const out = laid(els);
    // `a1` sits left of `a` and must still clear the root: `a` goes out by the gap, `a1`'s width and its gap.
    expect(box(out, 'a1').x).toBe(W + MIND_CHILD_GAP_X);
    expect(box(out, 'a').x).toBe(box(out, 'a1').x + W + MIND_CHILD_GAP_X);
  });

  it('keeps a branch placed by hand where it stands, growing its own way', () => {
    const els: Element[] = [
      node('r', undefined, 'any', { x: 0, y: 0 }),
      node('p', 'r', 'downward', { x: 900, y: 900 }, { mindPlaced: true }),
      node('p1', 'p'),
    ];
    const out = laid(els);
    expect(box(out, 'p')).toMatchObject({ x: 900, y: 900 });
    expect(box(out, 'p1')).toMatchObject({ x: 900, y: 900 + H + MIND_CHILD_GAP_Y });
  });

  it('pads a group of siblings on an any-direction side', () => {
    const els: Element[] = [
      node('r', undefined, 'any', { x: 0, y: 0 }),
      node('a', 'r', 'downward', {}, { mindGroup: 'g' }),
      node('b', 'r', 'downward', {}, { mindGroup: 'g' }),
    ];
    const out = laid(els);
    // Across a row, a group's room is its padding at both ends, no title band.
    const a = box(out, 'a');
    const b = box(out, 'b');
    expect(b.x - (a.x + W)).toBeGreaterThan(0);
    expect(a.x + (b.x + W - a.x) / 2).toBe(W / 2);
    expect(a.x).toBeLessThan(-MIND_GROUP_PADDING);
  });

  it('reads siblings in order per side: across a row above or below, down a column either side', () => {
    const els: Element[] = [
      node('r', undefined, 'any', { x: 0, y: 0 }),
      node('u2', 'r', 'upward', { x: 300, y: -200 }),
      node('u1', 'r', 'upward', { x: -300, y: -200 }),
      node('l2', 'r', 'leftward', { x: -300, y: 300 }),
      node('l1', 'r', 'leftward', { x: -300, y: -300 }),
    ];
    const order = mindNodesInOrder(els, 'r', 'any').map(({ node: n }) => n.id);
    expect(order.indexOf('u1')).toBeLessThan(order.indexOf('u2'));
    expect(order.indexOf('l1')).toBeLessThan(order.indexOf('l2'));
  });
});

describe('reanchorMindConnectors with nothing to move', () => {
  it('changes nothing', () => {
    expect(reanchorMindConnectors(threeWays(), new Set(), 'any', new Map())).toEqual([]);
  });
});
