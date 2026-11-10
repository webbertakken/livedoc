import { describe, expect, it } from 'vitest';
import { createPinnedArrow, createShape } from './factories';
import {
  MIND_CHILD_GAP_X,
  MIND_CHILD_GAP_Y,
  MIND_SIBLING_GAP_Y,
  MIND_FLOWS,
  type MindFlow,
} from './mind-flow';
import {
  MIND_GROUP_PADDING,
  isMindTreeTidy,
  layoutMindTree,
  mindGroupBoxes,
  mindNumbers,
  reanchorMindConnectors,
} from './mind-layout';
import type { ArrowElement, Element, ShapeElement } from './index';

// docs/specs/009-elements/mind-node.md "A tidy map stays tidy".

const node = (
  id: string,
  parent?: string,
  at: { x?: number; y?: number; w?: number; h?: number } = {},
): ShapeElement => ({
  ...createShape('mind-node', at.x ?? 0, at.y ?? 0),
  id,
  width: at.w ?? 200,
  height: at.h ?? 60,
  ...(parent ? { mindParentId: parent } : {}),
});

const apply = (els: Element[], layout: Map<string, { x: number; y: number }>): Element[] =>
  els.map((el) => (layout.has(el.id) ? { ...el, ...layout.get(el.id)! } : el));

const box = (els: Element[], id: string) => els.find((e) => e.id === id) as ShapeElement;
const cy = (n: ShapeElement) => n.y + n.height / 2;
const cx = (n: ShapeElement) => n.x + n.width / 2;

// A root with three children, the middle one carrying two grandchildren.
const map = (): Element[] => [
  node('r', undefined, { x: 100, y: 300 }),
  node('a', 'r'),
  node('b', 'r'),
  node('c', 'r'),
  node('b1', 'b'),
  node('b2', 'b'),
];

describe('layoutMindTree: tree flow', () => {
  const laid = () => apply(map(), layoutMindTree(map(), 'r', 'tree'));

  it('keeps the root where it is', () => {
    expect(box(laid(), 'r')).toMatchObject({ x: 100, y: 300 });
  });

  it('puts children one gap to the right of their parent', () => {
    const els = laid();
    for (const id of ['a', 'b', 'c']) expect(box(els, id).x).toBe(100 + 200 + MIND_CHILD_GAP_X);
    expect(box(els, 'b1').x).toBe(box(els, 'b').x + 200 + MIND_CHILD_GAP_X);
  });

  it('centres every parent on the block of its children', () => {
    const els = laid();
    expect(cy(box(els, 'r'))).toBe((cy(box(els, 'a')) + cy(box(els, 'c'))) / 2);
    expect(cy(box(els, 'b'))).toBe((cy(box(els, 'b1')) + cy(box(els, 'b2'))) / 2);
  });

  it('stacks sibling subtrees with exactly the sibling gap and no overlap', () => {
    const els = laid();
    const a = box(els, 'a');
    const b1 = box(els, 'b1');
    // a's subtree is just a; b's block starts at b1.
    expect(b1.y - (a.y + a.height)).toBe(MIND_SIBLING_GAP_Y);
  });

  it('is a fixed point, so a laid-out map reads as tidy', () => {
    const els = laid();
    expect(isMindTreeTidy(els, 'r', 'tree')).toBe(true);
    expect(apply(els, layoutMindTree(els, 'r', 'tree'))).toEqual(els);
  });

  it('reads sibling order from the drawing, not the document', () => {
    // c is drawn above a, so it stays above a.
    const els = map().map((el) => (el.id === 'c' ? { ...el, y: -500 } : el));
    const out = apply(els, layoutMindTree(els, 'r', 'tree'));
    expect(box(out, 'c').y).toBeLessThan(box(out, 'a').y);
  });

  it('inserts a hinted node right after the sibling it names', () => {
    const els = laid();
    const withNew = [...els, node('n', 'r')];
    const out = apply(withNew, layoutMindTree(withNew, 'r', 'tree', { id: 'n', after: 'a' }));
    const ys = ['a', 'n', 'b', 'c'].map((id) => box(out, id).y);
    expect([...ys].sort((p, q) => p - q)).toEqual(ys);
  });

  it('puts a hinted node with no `after` at the end', () => {
    const els = laid();
    const withNew = [...els, node('n', 'r')];
    const out = apply(withNew, layoutMindTree(withNew, 'r', 'tree', { id: 'n' }));
    expect(box(out, 'n').y).toBeGreaterThan(box(out, 'c').y);
  });
});

describe('layoutMindTree: other flows', () => {
  it('downward stacks levels vertically, siblings across', () => {
    const out = apply(map(), layoutMindTree(map(), 'r', 'downward'));
    expect(box(out, 'a').y).toBe(300 + 60 + MIND_CHILD_GAP_Y);
    expect(cx(box(out, 'r'))).toBe((cx(box(out, 'a')) + cx(box(out, 'c'))) / 2);
  });

  it('balanced keeps each branch on the side it is drawn on', () => {
    const els = map().map((el) =>
      el.id === 'c' ? { ...el, x: -600 } : el.id === 'r' ? el : { ...el, x: 600 },
    );
    const out = apply(els, layoutMindTree(els, 'r', 'balanced'));
    expect(box(out, 'c').x + 200).toBe(100 - MIND_CHILD_GAP_X);
    expect(box(out, 'a').x).toBe(100 + 200 + MIND_CHILD_GAP_X);
  });

  it('balanced deals branches out to both sides when switched to from a one-sided flow', () => {
    const tree = apply(map(), layoutMindTree(map(), 'r', 'tree'));
    const out = apply(tree, layoutMindTree(tree, 'r', 'balanced', undefined, 'tree'));
    const sides = ['a', 'b', 'c'].map((id) => cx(box(out, id)) < cx(box(out, 'r')));
    expect(sides).toContain(true);
    expect(sides).toContain(false);
  });

  it('bubble sends a lone first branch east', () => {
    const els: Element[] = [node('r', undefined, { x: 0, y: 0 }), node('a', 'r')];
    const out = apply(els, layoutMindTree(els, 'r', 'bubble'));
    expect(cy(box(out, 'a'))).toBe(cy(box(out, 'r')));
    expect(box(out, 'a').x).toBeGreaterThan(200);
  });

  it('bubble keeps every node clear of every other', () => {
    const out = apply(map(), layoutMindTree(map(), 'r', 'bubble'));
    const nodes = out as ShapeElement[];
    for (const p of nodes)
      for (const q of nodes) {
        if (p === q) continue;
        const clear =
          p.x + p.width <= q.x ||
          q.x + q.width <= p.x ||
          p.y + p.height <= q.y ||
          q.y + q.height <= p.y;
        expect(clear, `${p.id} overlaps ${q.id}`).toBe(true);
      }
  });

  // An any-direction map's children hold their sides; mind-layout-directions.test.ts lays those out.
  it.each(MIND_FLOWS.filter((f) => f !== 'any').map((f) => [f]))(
    '%s is a fixed point',
    (flow: MindFlow) => {
      const once = apply(map(), layoutMindTree(map(), 'r', flow));
      expect(isMindTreeTidy(once, 'r', flow)).toBe(true);
    },
  );
});

describe('isMindTreeTidy', () => {
  it('is false once a node has been dragged', () => {
    const laid = apply(map(), layoutMindTree(map(), 'r', 'tree'));
    const moved = laid.map((el) => (el.id === 'b1' ? { ...el, x: box(laid, 'b1').x + 40 } : el));
    expect(isMindTreeTidy(moved, 'r', 'tree')).toBe(false);
  });

  it('is true for a lone root', () => {
    expect(isMindTreeTidy([node('r')], 'r', 'tree')).toBe(true);
  });

  it('survives a cycle in the parent pointers', () => {
    const els: Element[] = [node('r'), node('a', 'b'), node('b', 'a')];
    expect(() => isMindTreeTidy(els, 'r', 'tree')).not.toThrow();
  });
});

describe('reanchorMindConnectors', () => {
  it('joins a tree child by east and west however far down it sits', () => {
    const parent = node('p', undefined, { x: 0, y: 0 });
    const child = node('c', 'p', { x: 300, y: 600 });
    const arrow = createPinnedArrow('p', 's', 'c', 'n');
    const out = reanchorMindConnectors(
      [parent, child, arrow],
      new Set(['p', 'c']),
      'tree',
      new Map(),
    );
    expect(out[0]).toMatchObject({ from: { anchor: 'e' }, to: { anchor: 'w' } });
  });

  it('leaves a connector that is already right alone', () => {
    const parent = node('p', undefined, { x: 0, y: 0 });
    const child = node('c', 'p', { x: 300, y: 0 });
    const arrow = createPinnedArrow('p', 'e', 'c', 'w');
    expect(
      reanchorMindConnectors([parent, child, arrow], new Set(['p', 'c']), 'tree', new Map()),
    ).toEqual([]);
  });

  it('handles a connector drawn child-to-parent', () => {
    const parent = node('p', undefined, { x: 0, y: 0 });
    const child = node('c', 'p', { x: 0, y: 300 });
    const arrow = createPinnedArrow('c', 'e', 'p', 'e');
    const out = reanchorMindConnectors(
      [parent, child, arrow],
      new Set(['p', 'c']),
      'downward',
      new Map(),
    );
    expect(out[0]).toMatchObject({ from: { anchor: 'n' }, to: { anchor: 's' } });
  });
});

// docs/specs/009-elements/mind-node.md "Flows": Leftward and Upward mirror Tree and Downward.
describe('layoutMindTree: mirrored flows', () => {
  const at = (flow: MindFlow) => apply(map(), layoutMindTree(map(), 'r', flow));

  it('leftward puts each level the child gap to the left, mirroring the tree', () => {
    const left = at('leftward');
    const tree = at('tree');
    const r = box(left, 'r');
    expect(box(left, 'b').x + box(left, 'b').width).toBe(r.x - MIND_CHILD_GAP_X);
    for (const id of ['a', 'b', 'c', 'b1', 'b2']) expect(box(left, id).y).toBe(box(tree, id).y);
  });

  it('upward puts each level above, mirroring the downward map', () => {
    const up = at('upward');
    const down = at('downward');
    const r = box(up, 'r');
    expect(box(up, 'a').y + box(up, 'a').height).toBe(r.y - MIND_CHILD_GAP_Y);
    for (const id of ['a', 'b', 'c', 'b1', 'b2']) expect(box(up, id).x).toBe(box(down, id).x);
  });

  it('both are fixed points, so a laid-out map reads as tidy', () => {
    for (const flow of ['leftward', 'upward'] as const)
      expect(isMindTreeTidy(at(flow), 'r', flow)).toBe(true);
  });

  it('upward connectors leave the parent top and enter the child bottom', () => {
    const els = at('upward');
    const arrow = { ...createPinnedArrow('r', 'e', 'a', 'w'), id: 'ra' } as ArrowElement;
    const [moved] = reanchorMindConnectors(
      [...els, arrow],
      new Set(['r', 'a']),
      'upward',
      new Map(),
    );
    expect([moved!.from, moved!.to].map((e) => (e as { anchor: string }).anchor)).toEqual([
      'n',
      's',
    ]);
  });
});

// docs/specs/009-elements/mind-node.md "Spacing": the root's spacing scales both gaps.
describe('layoutMindTree: spacing', () => {
  const withSpacing = (spacing?: 'tight' | 'compact' | 'comfortable' | 'wide') =>
    map().map((el) => (el.id === 'r' && spacing ? { ...el, mindSpacing: spacing } : el));
  const gapsOf = (spacing?: 'tight' | 'compact' | 'comfortable' | 'wide') => {
    const els = apply(withSpacing(spacing), layoutMindTree(withSpacing(spacing), 'r', 'tree'));
    const r = box(els, 'r');
    return {
      child: box(els, 'a').x - (r.x + r.width),
      sibling: box(els, 'c').y - (box(els, 'b2').y + box(els, 'b2').height),
    };
  };

  it('comfortable is exactly the gaps a map without a spacing has', () => {
    expect(gapsOf('comfortable')).toEqual(gapsOf());
    expect(gapsOf()).toEqual({ child: MIND_CHILD_GAP_X, sibling: MIND_SIBLING_GAP_Y });
  });

  it('tight, compact and wide scale both gaps', () => {
    expect(gapsOf('tight')).toEqual({ child: 32, sibling: 9 });
    expect(gapsOf('compact')).toEqual({ child: 48, sibling: 14 });
    expect(gapsOf('wide')).toEqual({ child: 96, sibling: 27 });
  });

  it('a spaced map is still a fixed point', () => {
    for (const s of ['tight', 'wide'] as const) {
      const els = apply(withSpacing(s), layoutMindTree(withSpacing(s), 'r', 'balanced'));
      expect(isMindTreeTidy(els, 'r', 'balanced')).toBe(true);
    }
  });
});

// docs/specs/009-elements/mind-node.md "A tidy map stays tidy" (placed by hand) and "Groups".
describe('layoutMindTree: placed nodes and groups', () => {
  const laid = (els: Element[], flow: MindFlow = 'tree') =>
    apply(els, layoutMindTree(els, 'r', flow));
  const stacked = () => laid(map());

  it('keeps a placed node where it is, lays its branch out from it, and closes its slot', () => {
    const base = stacked();
    const moved = base.map((e) => (e.id === 'b' ? { ...e, x: 900, y: 40, mindPlaced: true } : e));
    const out = laid(moved);
    expect(box(out, 'b')).toMatchObject({ x: 900, y: 40 });
    expect(box(out, 'b1').x).toBe(900 + 200 + MIND_CHILD_GAP_X);
    // a and c now stack as the only two in the column, centred on the root.
    expect(box(out, 'c').y - box(out, 'a').y).toBe(60 + MIND_SIBLING_GAP_Y);
    expect((cy(box(out, 'a')) + cy(box(out, 'c'))) / 2).toBe(cy(box(out, 'r')));
    expect(isMindTreeTidy(out, 'r', 'tree')).toBe(true);
  });

  it('keeps a group together, its members in a row, set apart by the group padding', () => {
    // c and a grouped; drawn order a, b, c: the group lands where its first member is.
    const els = stacked().map((e) => (e.id === 'a' || e.id === 'c' ? { ...e, mindGroup: 'g' } : e));
    const out = laid(els);
    const order = ['a', 'b', 'c'].sort((p, q) => box(out, p).y - box(out, q).y);
    expect(order).toEqual(['a', 'c', 'b']);
    expect(box(out, 'c').y - (box(out, 'a').y + 60)).toBe(MIND_SIBLING_GAP_Y);
    // b's branch begins with b1, its first child.
    const after = box(out, 'b1').y - (box(out, 'c').y + 60);
    expect(after).toBe(MIND_SIBLING_GAP_Y + MIND_GROUP_PADDING);
    expect(isMindTreeTidy(out, 'r', 'tree')).toBe(true);
  });

  it('draws one box around a group, its branches inside', () => {
    const els = laid(
      stacked().map((e) => (e.id === 'b' || e.id === 'c' ? { ...e, mindGroup: 'g' } : e)),
    );
    const [group] = mindGroupBoxes(els);
    expect(group).toMatchObject({ parentId: 'r', groupId: 'g', memberIds: ['b', 'c'] });
    for (const id of ['b', 'c', 'b1', 'b2']) {
      const n = box(els, id);
      expect(n.x).toBeGreaterThanOrEqual(group!.x + MIND_GROUP_PADDING);
      expect(n.y + n.height).toBeLessThanOrEqual(group!.y + group!.height - MIND_GROUP_PADDING);
    }
  });

  it('numbers the numbered siblings in the order they are drawn', () => {
    const els = stacked().map((e) =>
      ['a', 'c', 'b1'].includes(e.id) ? { ...e, mindNumbered: true } : e,
    );
    const numbers = mindNumbers(els);
    expect(Object.fromEntries(numbers)).toEqual({ a: 1, c: 2, b1: 1 });
  });
});
