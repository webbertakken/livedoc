import { describe, expect, it } from 'vitest';
import { createPinnedArrow, createShape } from './factories';
import { applyMindMoves, relayoutMindMap } from './mind-grow';
import { tidyMindBranches } from './mind-tidy-branches';
import type { Element, ShapeElement } from './index';

// docs/specs/009-elements/mind-node.md "Tidy Branches": each selected node's branch laid out from the node where it
// stands; a node inside another selected branch arranged once; nothing outside the branches moves.

const node = (id: string, parent?: string): ShapeElement => ({
  ...createShape('mind-node', 0, 0),
  id,
  width: 200,
  height: 60,
  ...(parent ? { mindParentId: parent } : { mindFlow: 'tree' as const, x: 100, y: 400 }),
});

const link = (from: string, to: string): Element => ({
  ...createPinnedArrow(from, 'e', to, 'w'),
  id: `${from}-${to}`,
});

// r -> a (a1, a2), b (b1, b2), c, laid out tidily, with its connectors.
function tidyMap(): Element[] {
  const els: Element[] = [
    node('r'),
    node('a', 'r'),
    node('a1', 'a'),
    node('a2', 'a'),
    node('b', 'r'),
    node('b1', 'b'),
    node('b2', 'b'),
    node('c', 'r'),
    link('r', 'a'),
    link('a', 'a1'),
    link('a', 'a2'),
    link('r', 'b'),
    link('b', 'b1'),
    link('b', 'b2'),
    link('r', 'c'),
  ];
  const plan = relayoutMindMap(els, 'r')!;
  return applyMindMoves(els, plan.moves, plan.reanchored);
}

const get = (els: Element[], id: string) => els.find((e) => e.id === id) as ShapeElement;
const at = (els: Element[], id: string) => ({ x: get(els, id).x, y: get(els, id).y });
const shift = (els: Element[], moves: Record<string, [number, number]>) =>
  els.map((e) => {
    const m = moves[e.id];
    return m ? { ...e, x: (e as ShapeElement).x + m[0], y: (e as ShapeElement).y + m[1] } : e;
  });

describe('tidyMindBranches', () => {
  it('lays each selected branch out from its node where it stands', () => {
    const tidy = tidyMap();
    // a and b dragged off by hand, their children scattered (each sibling order kept: it is read as drawn).
    const messy = shift(tidy, {
      a: [300, -200],
      a1: [-40, 30],
      a2: [700, 90],
      b: [250, 300],
      b1: [10, -600],
      b2: [-300, 0],
    });
    const out = tidyMindBranches(messy, new Set(['a', 'b']));
    expect(at(out, 'a')).toEqual(at(messy, 'a'));
    expect(at(out, 'b')).toEqual(at(messy, 'b'));
    // The branch keeps the shape the tidy map gives it, carried to where its node now stands.
    expect(at(out, 'a1')).toEqual({ x: get(tidy, 'a1').x + 300, y: get(tidy, 'a1').y - 200 });
    expect(at(out, 'a2')).toEqual({ x: get(tidy, 'a2').x + 300, y: get(tidy, 'a2').y - 200 });
    expect(at(out, 'b1')).toEqual({ x: get(tidy, 'b1').x + 250, y: get(tidy, 'b1').y + 300 });
    expect(at(out, 'b2')).toEqual({ x: get(tidy, 'b2').x + 250, y: get(tidy, 'b2').y + 300 });
  });

  it('moves nothing outside the selected branches', () => {
    const messy = shift(tidyMap(), { a: [300, -200], a1: [-40, 500], c: [90, 90], b1: [0, 400] });
    const out = tidyMindBranches(messy, new Set(['a']));
    for (const id of ['r', 'b', 'b1', 'b2', 'c']) expect(at(out, id)).toEqual(at(messy, id));
  });

  it('arranges a node inside another selected branch once, as part of it', () => {
    const messy = shift(tidyMap(), { a: [300, -200], a1: [-40, 500], a2: [700, 90] });
    expect(tidyMindBranches(messy, new Set(['a', 'a1']))).toEqual(
      tidyMindBranches(messy, new Set(['a'])),
    );
  });

  it('acts on the nodes and carries the lines: a selected connector changes nothing', () => {
    const messy = shift(tidyMap(), { a: [300, -200], a1: [-40, 500] });
    expect(tidyMindBranches(messy, new Set(['a', 'a-a1', 'r-a']))).toEqual(
      tidyMindBranches(messy, new Set(['a'])),
    );
  });

  it('puts a node placed by hand inside a branch back into the layout', () => {
    const tidy = tidyMap();
    const messy = shift(tidy, { a2: [700, 90] }).map((e) =>
      e.id === 'a2' ? { ...e, mindPlaced: true } : e,
    );
    const out = tidyMindBranches(messy, new Set(['a']));
    expect(at(out, 'a2')).toEqual(at(tidy, 'a2'));
    expect(get(out, 'a2').mindPlaced).toBeUndefined();
  });

  it('keeps the selected node as it is: not placed by hand by the tidy', () => {
    const messy = shift(tidyMap(), { a: [300, -200], a1: [-40, 500] });
    const out = tidyMindBranches(messy, new Set(['a']));
    expect(get(out, 'a').mindPlaced).toBeUndefined();
  });

  it('returns the elements themselves when every branch is already tidy, or holds no children', () => {
    const tidy = tidyMap();
    expect(tidyMindBranches(tidy, new Set(['a', 'b']))).toBe(tidy);
    expect(tidyMindBranches(tidy, new Set(['c', 'r-c']))).toBe(tidy);
  });

  it('tidies a root branch as the whole map, the root where it stands', () => {
    const tidy = tidyMap();
    const messy = shift(tidy, { r: [50, 50], a: [300, -200], c: [0, 400] });
    const out = tidyMindBranches(messy, new Set(['r']));
    expect(at(out, 'r')).toEqual(at(messy, 'r'));
    expect(at(out, 'c')).toEqual({ x: get(tidy, 'c').x + 50, y: get(tidy, 'c').y + 50 });
  });
});
