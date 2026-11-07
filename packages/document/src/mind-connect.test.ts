import { describe, expect, it } from 'vitest';
import { createPinnedArrow, createShape } from './factories';
import { connectMindNodes, insertMindParent } from './mind-connect';
import { applyMindMoves, relayoutMindMap } from './mind-grow';
import { isMindTreeTidy } from './mind-layout';
import { mindRootOf, withMindBranches } from './mind-map';
import type { ArrowElement, Element, ShapeElement } from './index';

// docs/specs/009-elements/mind-node.md "Add Parent" and "Connecting nodes".

const node = (id: string, parent?: string, extra: Partial<ShapeElement> = {}): ShapeElement => ({
  ...createShape('mind-node', 0, 0),
  id,
  label: id,
  ...(parent ? { mindParentId: parent } : { mindFlow: 'tree' as const }),
  ...extra,
});
const link = (from: string, to: string, id = `${from}-${to}`): ArrowElement => ({
  ...createPinnedArrow(from, 'e', to, 'w'),
  id,
});

// root -> a -> (a1, a2), root -> b: laid out tidily.
function tidyMap(): Element[] {
  const els: Element[] = [
    node('root'),
    node('a', 'root'),
    node('b', 'root'),
    node('a1', 'a'),
    node('a2', 'a'),
    link('root', 'a'),
    link('root', 'b'),
    link('a', 'a1'),
    link('a', 'a2'),
  ];
  // Stack them so the drawn order reads a, b and a1, a2 before the first layout.
  const stacked = els.map((el, i) => (el.type === 'shape' ? { ...el, y: i * 200 } : el));
  const plan = relayoutMindMap(stacked, 'root')!;
  return applyMindMoves(stacked, plan.moves, plan.reanchored);
}

const get = (els: Element[], id: string) => els.find((e) => e.id === id) as ShapeElement;
const links = (els: Element[]) =>
  els
    .filter((e): e is ArrowElement => e.type === 'arrow')
    .map((a) =>
      a.from.kind === 'pinned' && a.to.kind === 'pinned'
        ? [a.from.elementId, a.to.elementId].sort().join('|')
        : 'free',
    )
    .sort();
const plainDress = (arrow: ArrowElement) => arrow;
const dressNode = (n: ShapeElement) => n;

describe('insertMindParent', () => {
  it('puts a new node between a node and its parent, and keeps a tidy map tidy', () => {
    const out = insertMindParent(
      tidyMap(),
      'a',
      { node: 'm', into: 'm-in', out: 'm-out' },
      {
        node: dressNode,
        connector: plainDress,
      },
    )!;
    expect(get(out, 'm').mindParentId).toBe('root');
    expect(get(out, 'a').mindParentId).toBe('m');
    expect(links(out)).toEqual(
      ['a1|a', 'a2|a', 'a|m', 'b|root', 'm|root'].map((p) => p.split('|').sort().join('|')).sort(),
    );
    expect(isMindTreeTidy(out, 'root', 'tree')).toBe(true);
  });

  it('gives a root a new root, which takes over the map', () => {
    const out = insertMindParent(
      tidyMap(),
      'root',
      { node: 'm', into: 'm-in', out: 'm-out' },
      {
        node: dressNode,
        connector: plainDress,
      },
    )!;
    expect(get(out, 'm')).toMatchObject({ mindFlow: 'tree' });
    expect(get(out, 'm')).not.toHaveProperty('mindParentId');
    expect(get(out, 'root').mindParentId).toBe('m');
    expect(get(out, 'root')).not.toHaveProperty('mindFlow');
    expect(mindRootOf(out, get(out, 'a1')).id).toBe('m');
    expect(isMindTreeTidy(out, 'm', 'tree')).toBe(true);
  });

  it('refuses anything but a mind node', () => {
    expect(
      insertMindParent(
        [link('x', 'y')],
        'x-y',
        { node: 'm', into: 'i', out: 'o' },
        {
          node: dressNode,
          connector: plainDress,
        },
      ),
    ).toBeNull();
  });
});

describe('connectMindNodes', () => {
  const connect = (els: Element[], drawn: ArrowElement, previous?: ArrowElement) =>
    connectMindNodes([...els, drawn], drawn.id, previous, plainDress);

  it('makes the node connected to the child of the node connected from', () => {
    const els = [...tidyMap(), node('loose', undefined, { x: 2000, y: 2000 })];
    const out = connect(els, link('b', 'loose', 'drawn'));
    expect(get(out, 'loose').mindParentId).toBe('b');
    expect(get(out, 'loose')).not.toHaveProperty('mindFlow');
    expect(isMindTreeTidy(out, 'root', 'tree')).toBe(true);
  });

  it('moves a node from its old parent, its connector with it', () => {
    const out = connect(tidyMap(), link('b', 'a1', 'drawn'));
    expect(get(out, 'a1').mindParentId).toBe('b');
    expect(links(out)).not.toContain(['a', 'a1'].sort().join('|'));
    expect(links(out)).toContain(['a1', 'b'].sort().join('|'));
  });

  it('swaps a parent and its child either way, the child taking the parent place', () => {
    for (const drawn of [link('a', 'a1', 'drawn'), link('a1', 'a', 'drawn')]) {
      const out = connect(tidyMap(), drawn);
      expect(get(out, 'a1').mindParentId).toBe('root');
      expect(get(out, 'a').mindParentId).toBe('a1');
      expect(get(out, 'a2').mindParentId).toBe('a');
      // One connector between the two, and the root now joined to a1.
      expect(links(out).filter((l) => l === ['a', 'a1'].sort().join('|'))).toHaveLength(1);
      expect(links(out)).toContain(['a1', 'root'].sort().join('|'));
      expect(links(out)).not.toContain(['a', 'root'].sort().join('|'));
      // Deleting the old parent takes only its own branch now.
      expect([...withMindBranches(out, new Set(['a']))]).not.toContain('a1');
    }
  });

  it('puts a node above its ancestor, a root handing it the map', () => {
    const out = connect(tidyMap(), link('a1', 'root', 'drawn'));
    expect(get(out, 'a1')).not.toHaveProperty('mindParentId');
    expect(get(out, 'a1')).toMatchObject({ mindFlow: 'tree' });
    expect(get(out, 'root').mindParentId).toBe('a1');
    expect(get(out, 'a').mindParentId).toBe('root');
    expect(links(out)).not.toContain(['a', 'a1'].sort().join('|'));
  });

  it('leaves a connector to anything but a mind node alone', () => {
    const box = { ...createShape('square', 0, 0), id: 'box' };
    const els = [...tidyMap(), box];
    const drawn = link('a', 'box', 'drawn');
    const before = [...els, drawn];
    expect(connectMindNodes(before, 'drawn', undefined, plainDress)).toBe(before);
  });

  it('frees the old child when a connector is moved off it', () => {
    const els = [...tidyMap(), node('loose', undefined, { x: 2000, y: 2000 })];
    const previous = els.find((e) => e.id === 'a-a2') as ArrowElement;
    const moved = {
      ...previous,
      to: { kind: 'pinned' as const, elementId: 'loose', anchor: 'w' as const },
    };
    const out = connectMindNodes(
      els.map((e) => (e.id === previous.id ? moved : e)),
      previous.id,
      previous,
      plainDress,
    );
    expect(get(out, 'loose').mindParentId).toBe('a');
    expect(get(out, 'a2')).not.toHaveProperty('mindParentId');
  });
});
