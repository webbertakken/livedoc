import { describe, expect, it } from 'vitest';
import { createPinnedArrow, createShape } from './factories';
import { joinConvertedMindNodes } from './mind-convert';
import { mindBranchFlowOf, mindSideOf } from './mind-direction';
import { isMindTreeTidy } from './mind-layout';
import { mindRootOf } from './mind-map';
import type { ArrowElement, Element, ShapeElement } from './index';

// docs/specs/009-elements/mind-node.md "Converting a flow": boxes joined by arrows, converted to mind nodes, are a
// mind map: the arrows are its tree, its root is found from them, and its directions come from where it is drawn.

const W = 100;
const H = 40;
const mind = (
  id: string,
  x: number,
  y: number,
  more: Partial<ShapeElement> = {},
): ShapeElement => ({
  ...createShape('mind-node', x, y),
  id,
  width: W,
  height: H,
  ...more,
});
const box = (id: string, x: number, y: number): ShapeElement => ({
  ...createShape('square', x, y),
  id,
  width: W,
  height: H,
});
const arrow = (from: string, to: string, more: Partial<ArrowElement> = {}): ArrowElement => ({
  ...createPinnedArrow(from, 's', to, 'n'),
  id: `${from}>${to}`,
  ...more,
});
const get = (els: Element[], id: string) => els.find((e) => e.id === id) as ShapeElement;
const parentOf = (els: Element[], id: string) => get(els, id).mindParentId;
const ids = (...list: string[]) => new Set(list);

// A top-down flow: r above a and b, a above c.
const topDown = (): Element[] => [
  mind('r', 200, 0),
  mind('a', 50, 150),
  mind('b', 350, 150),
  mind('c', 50, 300),
  arrow('r', 'a'),
  arrow('r', 'b'),
  arrow('a', 'c'),
];

describe('joinConvertedMindNodes', () => {
  it('makes the arrows between converted nodes the tree, parent to child as they point', () => {
    const out = joinConvertedMindNodes(topDown(), ids('r', 'a', 'b', 'c'));

    expect(parentOf(out, 'r')).toBeUndefined();
    expect(parentOf(out, 'a')).toBe('r');
    expect(parentOf(out, 'b')).toBe('r');
    expect(parentOf(out, 'c')).toBe('a');
  });

  it('finds the root from the arrows, wherever it sits in document order', () => {
    const els: Element[] = [mind('c', 0, 300), mind('a', 0, 150), mind('r', 0, 0)];
    els.push(arrow('a', 'c'), arrow('r', 'a'));

    const out = joinConvertedMindNodes(els, ids('a', 'c', 'r'));

    expect(mindRootOf(out, get(out, 'c')).id).toBe('r');
  });

  it('gives a top-down flow a Downward map, its deeper nodes following on Auto', () => {
    const out = joinConvertedMindNodes(topDown(), ids('r', 'a', 'b', 'c'));

    expect(get(out, 'r').mindFlow).toBe('downward');
    for (const id of ['a', 'b', 'c']) expect(get(out, id).mindFlow).toBeUndefined();
    expect(mindBranchFlowOf(out, get(out, 'a'))).toBe('downward');
  });

  it.each([
    ['tree', { x: 300, y: 0 }],
    ['leftward', { x: -300, y: 0 }],
    ['upward', { x: 0, y: -300 }],
  ] as const)('gives a flow drawn %s that direction', (flow, at) => {
    const els: Element[] = [mind('r', 0, 0), mind('a', at.x, at.y), arrow('r', 'a')];

    const out = joinConvertedMindNodes(els, ids('r', 'a'));

    expect(get(out, 'r').mindFlow).toBe(flow);
  });

  it('grows a decision fanning its branches out diagonally below it Downward', () => {
    const els: Element[] = [
      mind('d', 0, 0),
      mind('yes', -200, 150),
      mind('no', 200, 150),
      arrow('d', 'yes'),
      arrow('d', 'no'),
    ];

    const out = joinConvertedMindNodes(els, ids('d', 'yes', 'no'));

    expect(get(out, 'd').mindFlow).toBe('downward');
  });

  it('reads a lone child drawn exactly diagonally as across, as a tie by position is', () => {
    const els: Element[] = [mind('r', 0, 0), mind('a', 200, 200), arrow('r', 'a')];

    const out = joinConvertedMindNodes(els, ids('r', 'a'));

    expect(get(out, 'r').mindFlow).toBe('tree');
  });

  it('grows a parent with children on several sides in Any direction, each child holding its side', () => {
    const els: Element[] = [
      mind('r', 0, 0),
      mind('right', 300, 0),
      mind('below', 0, 300),
      arrow('r', 'right'),
      arrow('r', 'below'),
    ];

    const out = joinConvertedMindNodes(els, ids('r', 'right', 'below'));

    expect(get(out, 'r').mindFlow).toBe('any');
    expect(get(out, 'right').mindFlow).toBe('tree');
    expect(get(out, 'below').mindFlow).toBe('downward');
  });

  it('keeps the direction a deeper node grows in when it differs from its parent', () => {
    const els: Element[] = [
      mind('r', 0, 0),
      mind('a', 0, 200),
      mind('c', 300, 200),
      arrow('r', 'a'),
      arrow('a', 'c'),
    ];

    const out = joinConvertedMindNodes(els, ids('r', 'a', 'c'));

    expect(get(out, 'r').mindFlow).toBe('downward');
    expect(get(out, 'a').mindFlow).toBe('tree');
    expect(mindSideOf(out, get(out, 'c'))).toBe('tree');
  });

  it('lays a fresh map out tidily around its root, which stays where it was drawn', () => {
    const out = joinConvertedMindNodes(topDown(), ids('r', 'a', 'b', 'c'));

    expect(get(out, 'r')).toMatchObject({ x: 200, y: 0 });
    expect(isMindTreeTidy(out, 'r', 'downward')).toBe(true);
  });

  it('keeps every arrow, its look and its label, whether the tree uses it or not', () => {
    const els = topDown();
    els[4] = arrow('r', 'a', { label: 'yes', strokeColor: '#ff0000', strokeStyle: 'dashed' });
    els.push(arrow('c', 'r'), arrow('b', 'c'));

    const out = joinConvertedMindNodes(els, ids('r', 'a', 'b', 'c'));
    const arrows = out.filter((e): e is ArrowElement => e.type === 'arrow');

    expect(arrows.map((a) => a.id).sort()).toEqual(['a>c', 'b>c', 'c>r', 'r>a', 'r>b']);
    expect(arrows.find((a) => a.id === 'r>a')).toMatchObject({
      label: 'yes',
      strokeColor: '#ff0000',
      strokeStyle: 'dashed',
    });
  });

  it('gives a node with two parents the first that reaches it, the other arrow staying ordinary', () => {
    const els: Element[] = [
      mind('p1', 0, 0),
      mind('p2', 300, 0),
      mind('x', 150, 200),
      arrow('p1', 'x'),
      arrow('p2', 'x'),
    ];

    const out = joinConvertedMindNodes(els, ids('p1', 'p2', 'x'));

    expect(parentOf(out, 'x')).toBe('p1');
    expect(parentOf(out, 'p2')).toBeUndefined();
    expect(out.some((e) => e.id === 'p2>x')).toBe(true);
  });

  it('leaves the arrow that closes a loop ordinary, the loop entered where an arrow comes in', () => {
    const els: Element[] = [
      mind('a', 0, 150),
      mind('b', 0, 300),
      mind('s', 0, 0),
      arrow('a', 'b'),
      arrow('b', 'a'),
      arrow('s', 'a'),
    ];

    const out = joinConvertedMindNodes(els, ids('a', 'b', 's'));

    expect(parentOf(out, 's')).toBeUndefined();
    expect(parentOf(out, 'a')).toBe('s');
    expect(parentOf(out, 'b')).toBe('a');
  });

  it('enters a loop with no way in at its first node in document order', () => {
    const els: Element[] = [
      mind('b', 0, 150),
      mind('a', 0, 0),
      mind('c', 0, 300),
      arrow('a', 'b'),
      arrow('b', 'c'),
      arrow('c', 'a'),
    ];

    const out = joinConvertedMindNodes(els, ids('a', 'b', 'c'));

    expect(parentOf(out, 'b')).toBeUndefined();
    expect(parentOf(out, 'c')).toBe('b');
    expect(parentOf(out, 'a')).toBe('c');
  });

  it('leaves arrows to boxes ordinary, joining them once those boxes are converted in turn', () => {
    const els: Element[] = [mind('r', 0, 0), box('a', 0, 150), arrow('r', 'a')];

    const first = joinConvertedMindNodes(els, ids('r'));
    expect(first).toBe(els);

    const later = first.map((e) => (e.id === 'a' ? mind('a', 0, 150) : e));
    const out = joinConvertedMindNodes(later, ids('a'));
    expect(parentOf(out, 'a')).toBe('r');
  });

  it('joins a converted node under a node of an existing map', () => {
    const els: Element[] = [
      mind('r', 0, 0, { mindFlow: 'downward' }),
      mind('k', 0, 90, { mindParentId: 'r' }),
      mind('x', 0, 250),
      arrow('r', 'k'),
      arrow('k', 'x'),
    ];

    const out = joinConvertedMindNodes(els, ids('x'));

    expect(parentOf(out, 'x')).toBe('k');
    expect(get(out, 'k').mindFlow).toBeUndefined();
  });

  it('puts an existing root under a converted node, its spacing gone and its direction passed up', () => {
    const els: Element[] = [
      mind('x', 0, 0),
      mind('r', 300, 0, { mindFlow: 'downward', mindSpacing: 'compact' }),
      mind('k', 300, 90, { mindParentId: 'r' }),
      arrow('r', 'k'),
      arrow('x', 'r'),
    ];

    const out = joinConvertedMindNodes(els, ids('x'));

    expect(parentOf(out, 'r')).toBe('x');
    expect(get(out, 'r').mindSpacing).toBeUndefined();
    expect(get(out, 'x').mindFlow).toBe('downward');
    expect(get(out, 'r').mindFlow).toBeUndefined();
    expect(mindBranchFlowOf(out, get(out, 'r'))).toBe('downward');
  });

  it('keeps a balanced root balanced when a converted child joins it across', () => {
    const els: Element[] = [
      mind('r', 0, 0, { mindFlow: 'balanced' }),
      mind('k', 300, 0, { mindParentId: 'r' }),
      mind('x', -300, 0),
      arrow('r', 'k'),
      arrow('r', 'x'),
    ];

    const out = joinConvertedMindNodes(els, ids('x'));

    expect(parentOf(out, 'x')).toBe('r');
    expect(get(out, 'r').mindFlow).toBe('balanced');
  });

  it('turns a balanced root joining under a converted node into a branch growing in Any direction', () => {
    const els: Element[] = [
      mind('x', 0, 0),
      mind('r', 0, 300, { mindFlow: 'balanced' }),
      mind('k', 300, 300, { mindParentId: 'r' }),
      arrow('r', 'k'),
      arrow('x', 'r'),
    ];

    const out = joinConvertedMindNodes(els, ids('x'));

    expect(parentOf(out, 'r')).toBe('x');
    expect(get(out, 'r').mindFlow).toBe('any');
    expect(get(out, 'x').mindFlow).toBe('downward');
  });

  it('turns a balanced root Downward when its only branch joins growing down', () => {
    const els: Element[] = [
      mind('r', 0, 0, { mindFlow: 'balanced' }),
      mind('x', 0, 300),
      mind('y', 0, 450),
      arrow('r', 'x'),
      arrow('x', 'y'),
    ];
    // x arrives as a downward branch of its own: y was under it before.
    els[1] = mind('x', 0, 300, { mindFlow: 'downward' });
    els[2] = mind('y', 0, 450, { mindParentId: 'x' });

    const out = joinConvertedMindNodes(els, ids('r'));

    expect(get(out, 'r').mindFlow).toBe('downward');
  });

  it('pins the side of every child of a parent turned Any direction, the ones it had too', () => {
    const els: Element[] = [
      mind('p', 0, 0),
      mind('k', 300, 0, { mindParentId: 'p' }),
      mind('x', 0, 300),
      arrow('p', 'k'),
      arrow('p', 'x'),
    ];

    const out = joinConvertedMindNodes(els, ids('x'));

    expect(get(out, 'p').mindFlow).toBe('any');
    expect(get(out, 'k').mindFlow).toBe('tree');
    expect(get(out, 'x').mindFlow).toBe('downward');
  });

  it('sets a joining branch on the side it grew in, under a parent turned Any direction', () => {
    const els: Element[] = [
      mind('x', 0, 0),
      mind('r', 0, -300),
      mind('k', 300, -300, { mindParentId: 'r' }),
      mind('z', 0, 300),
      arrow('r', 'k'),
      arrow('x', 'r'),
      arrow('x', 'z'),
    ];

    const out = joinConvertedMindNodes(els, ids('x', 'z'));

    expect(get(out, 'x').mindFlow).toBe('any');
    expect(get(out, 'r').mindFlow).toBe('tree');
    expect(get(out, 'z').mindFlow).toBe('downward');
  });

  it('keeps the direction a joining branch holds, under a parent turned Any direction', () => {
    const els: Element[] = [
      mind('x', 0, 0),
      mind('r', 300, 0, { mindFlow: 'upward' }),
      mind('k', 300, -300, { mindParentId: 'r' }),
      mind('z', 0, 300),
      arrow('r', 'k'),
      arrow('x', 'r'),
      arrow('x', 'z'),
    ];

    const out = joinConvertedMindNodes(els, ids('x', 'z'));

    expect(get(out, 'x').mindFlow).toBe('any');
    expect(get(out, 'r').mindFlow).toBe('upward');
  });

  it('keeps a bubble root a bubble, its new branches holding no direction', () => {
    const els: Element[] = [mind('r', 0, 0, { mindFlow: 'bubble' }), mind('x', 0, 300)];
    els.push(arrow('r', 'x'));

    const out = joinConvertedMindNodes(els, ids('x'));

    expect(parentOf(out, 'x')).toBe('r');
    expect(get(out, 'r').mindFlow).toBe('bubble');
    expect(get(out, 'x').mindFlow).toBeUndefined();
  });

  it('keeps a hand-arranged map where it is, joining the converted node in place', () => {
    const els: Element[] = [
      mind('r', 0, 0, { mindFlow: 'downward' }),
      mind('k', 777, 555, { mindParentId: 'r' }),
      mind('x', 0, 900),
      arrow('r', 'k'),
      arrow('k', 'x'),
    ];

    const out = joinConvertedMindNodes(els, ids('x'));

    expect(parentOf(out, 'x')).toBe('k');
    expect(get(out, 'k')).toMatchObject({ x: 777, y: 555 });
    expect(get(out, 'x')).toMatchObject({ x: 0, y: 900 });
  });

  it('ignores arrows that are not pinned at both ends, or join a node to itself', () => {
    const loose: ArrowElement = {
      ...arrow('r', 'a'),
      id: 'loose',
      to: { kind: 'free', x: 0, y: 300 },
    };
    const els: Element[] = [mind('r', 0, 0), mind('a', 0, 150), loose, arrow('a', 'a')];

    expect(joinConvertedMindNodes(els, ids('r', 'a'))).toBe(els);
  });

  it('leaves an arrow already joining a node to its parent as it is', () => {
    const els: Element[] = [
      mind('r', 0, 0, { mindFlow: 'downward' }),
      mind('k', 0, 90, { mindParentId: 'r' }),
      arrow('k', 'r'),
    ];

    expect(joinConvertedMindNodes(els, ids('k'))).toBe(els);
  });

  it('keeps the flow a parent already has when every child sits its way', () => {
    const els: Element[] = [
      mind('r', 0, 0, { mindFlow: 'tree' }),
      mind('k', 300, 0, { mindParentId: 'r' }),
      mind('x', 300, 100),
      arrow('r', 'k'),
      arrow('r', 'x'),
    ];

    const out = joinConvertedMindNodes(els, ids('x'));

    expect(get(out, 'r').mindFlow).toBe('tree');
    expect(get(out, 'x').mindFlow).toBeUndefined();
  });
});
