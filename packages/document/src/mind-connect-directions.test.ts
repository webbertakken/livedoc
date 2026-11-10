import { describe, expect, it } from 'vitest';
import { createPinnedArrow, createShape } from './factories';
import { connectMindNodes, insertMindParent } from './mind-connect';
import { mindSideOf } from './mind-direction';
import type { MindFlow } from './mind-flow';
import type { ArrowElement, Element, ShapeElement } from './index';

// docs/specs/009-elements/mind-node.md "Add Parent", "Connecting nodes" and "A direction per node": a node changing
// place keeps the direction it grows in, and a map arranged by hand steps a branch out along the side it sits on.

const W = 100;
const H = 40;
const node = (
  id: string,
  parent?: string,
  flow?: MindFlow,
  at: { x: number; y: number } = { x: 0, y: 0 },
): ShapeElement => ({
  ...createShape('mind-node', at.x, at.y),
  id,
  width: W,
  height: H,
  ...(parent ? { mindParentId: parent } : {}),
  ...(flow ? { mindFlow: flow } : {}),
});
const link = (from: string, to: string, id = `${from}-${to}`): ArrowElement => ({
  ...createPinnedArrow(from, 'e', to, 'w'),
  id,
});
const get = (els: Element[], id: string) => els.find((e) => e.id === id) as ShapeElement;
const plain = { node: (n: ShapeElement) => n, connector: (a: ArrowElement) => a };
const ids = { node: 'm', into: 'm-in', out: 'm-out' };

// A root and one child at `at`, placed by hand somewhere the layout would not put it (so the map is not tidy).
const handMap = (flow: MindFlow, at: { x: number; y: number }): Element[] => [
  node('r', undefined, flow, { x: 0, y: 0 }),
  node('a', 'r', undefined, at),
  link('r', 'a'),
];

describe('Add Parent in a map arranged by hand', () => {
  it.each([
    ['tree', { x: 500, y: 333 }, { dx: W + 64, dy: 0 }],
    ['leftward', { x: -500, y: 333 }, { dx: -(W + 64), dy: 0 }],
    ['downward', { x: 333, y: 500 }, { dx: 0, dy: H + 50 }],
    ['upward', { x: 333, y: -500 }, { dx: 0, dy: -(H + 50) }],
    ['balanced', { x: -500, y: 333 }, { dx: -(W + 64), dy: 0 }],
  ] as const)('steps a %s branch out along its side', (flow, at, step) => {
    const out = insertMindParent(handMap(flow, at), 'a', ids, plain)!;
    expect(get(out, 'm')).toMatchObject(at);
    expect(get(out, 'a')).toMatchObject({ x: at.x + step.dx, y: at.y + step.dy });
  });

  it('steps a bubble branch out along the way it already points', () => {
    const out = insertMindParent(handMap('bubble', { x: 600, y: 800 }), 'a', ids, plain)!;
    const a = get(out, 'a');
    expect(a.x).toBeGreaterThan(600);
    expect(a.y).toBeGreaterThan(800);
  });

  it.each([
    ['tree', { dx: W + 64, dy: 0 }],
    ['downward', { dx: 0, dy: H + 50 }],
    ['any', { dx: W + 64, dy: 0 }],
    ['bubble', { dx: W + 64, dy: 0 }],
  ] as const)("steps a %s map's root out as a branch would", (flow, step) => {
    const els: Element[] = [...handMap(flow, { x: 777, y: 999 })];
    const out = insertMindParent(els, 'r', ids, plain)!;
    expect(get(out, 'r')).toMatchObject({ x: step.dx, y: step.dy });
    expect(get(out, 'm').mindFlow).toBe(flow);
  });
});

describe('Add Parent keeps directions', () => {
  it('gives the new node the side under an any-direction parent, the node dropping the same one', () => {
    const els: Element[] = [
      node('r', undefined, 'any', { x: 0, y: 0 }),
      node('a', 'r', 'upward', { x: 0, y: -90 }),
      link('r', 'a'),
    ];
    const out = insertMindParent(els, 'a', ids, plain)!;
    expect(get(out, 'm').mindFlow).toBe('upward');
    expect(get(out, 'a').mindFlow).toBeUndefined();
    expect(mindSideOf(out, get(out, 'a'))).toBe('upward');
  });

  it('keeps a direction the node holds of its own under the new node', () => {
    const els: Element[] = [
      node('r', undefined, undefined, { x: 0, y: 0 }),
      node('a', 'r', 'downward', { x: 164, y: 0 }),
      link('r', 'a'),
    ];
    const out = insertMindParent(els, 'a', ids, plain)!;
    expect(get(out, 'm').mindFlow).toBeUndefined();
    expect(get(out, 'a').mindFlow).toBe('downward');
  });

  it('lets an any-direction root keep its own under its new root, so its branches keep their sides', () => {
    const els: Element[] = [
      node('r', undefined, 'any'),
      node('a', 'r', 'upward', { x: 0, y: -90 }),
    ];
    const out = insertMindParent(els, 'r', ids, plain)!;
    expect(get(out, 'm').mindFlow).toBe('any');
    expect(get(out, 'r').mindFlow).toBe('any');
  });

  it('joins a node with a parent but no connector to it, through the side it sits on', () => {
    const els: Element[] = [
      node('r', undefined, 'downward', { x: 0, y: 0 }),
      node('a', 'r', undefined, { x: 0, y: 90 }),
    ];
    const out = insertMindParent(els, 'a', ids, plain)!;
    const into = out.find((e) => e.id === 'm-in') as ArrowElement;
    expect([into.from, into.to].map((e) => (e.kind === 'pinned' ? e.anchor : null))).toEqual([
      's',
      'n',
    ]);
  });
});

describe('a connector moved off its pair', () => {
  it('frees the parent end when the connector ran child to parent', () => {
    const els: Element[] = [
      node('r', undefined, 'upward', { x: 0, y: 0 }),
      node('a', 'r', undefined, { x: 0, y: -90 }),
      { ...link('a', 'r'), id: 'c' },
    ];
    const previous = els[2] as ArrowElement;
    const moved: ArrowElement = { ...previous, from: { kind: 'free', x: 500, y: 500 } };
    const out = connectMindNodes([...els.slice(0, 2), moved], 'c', previous, plain.connector);
    expect(get(out, 'a').mindParentId).toBeUndefined();
    expect(get(out, 'a').mindFlow).toBe('upward');
  });

  it('leaves a pair that was never a parent and child as it was', () => {
    const els: Element[] = [node('x'), node('y'), link('x', 'y', 'c')];
    const previous = els[2] as ArrowElement;
    const moved: ArrowElement = { ...previous, to: { kind: 'free', x: 9, y: 9 } };
    const out = connectMindNodes([...els.slice(0, 2), moved], 'c', previous, plain.connector);
    expect(get(out, 'x').mindParentId).toBeUndefined();
    expect(get(out, 'y').mindParentId).toBeUndefined();
  });
});
