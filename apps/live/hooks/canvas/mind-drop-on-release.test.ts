import { describe, expect, it } from 'vitest';
import {
  applyMindMoves,
  createShape,
  relayoutMindMap,
  type Element,
  type ShapeElement,
} from '@livedoc/document';
import { mindDropGuide, mindDropNow, mindDropOnRelease } from './mind-drop-on-release';

// docs/specs/009-elements/mind-node.md "A tidy map stays tidy": the marker while dragging, the drop on release.

const node = (id: string, parent?: string, y = 0): ShapeElement => ({
  ...createShape('mind-node', 0, y),
  id,
  width: 200,
  height: 60,
  ...(parent ? { mindParentId: parent } : { mindFlow: 'tree' as const }),
});

function tidy(): Element[] {
  const els: Element[] = [
    node('r', undefined, 200),
    node('a', 'r', 0),
    node('b', 'r', 100),
    node('c', 'r', 300),
  ];
  const plan = relayoutMindMap(els, 'r')!;
  return applyMindMoves(els, plan.moves, plan.reanchored);
}
const get = (els: Element[], id: string) => els.find((e) => e.id === id) as ShapeElement;
const moved = (els: Element[], id: string, dy: number) =>
  els.map((e) => (e.id === id ? { ...e, y: (e as ShapeElement).y + dy } : e));

describe('mind drop', () => {
  it('marks the slot a node would be reordered into, along the stacking axis', () => {
    const before = tidy();
    const after = moved(before, 'a', get(before, 'c').y - get(before, 'a').y + 20);
    const drop = mindDropNow(before, after, 'a', new Set(['a']));
    expect(drop?.kind).toBe('reordered');
    expect(mindDropGuide(before, 'a', drop)).toMatchObject({ axis: 'y' });
  });

  it('reorders on release, and leaves a root to its plain move', () => {
    const before = tidy();
    const after = moved(before, 'a', get(before, 'c').y - get(before, 'a').y + 20);
    const out = mindDropOnRelease(before, 'a', new Set(['a']))(after);
    expect(get(out, 'a').y).toBeGreaterThan(get(out, 'c').y);
    const rootMoved = moved(before, 'r', 50);
    expect(mindDropOnRelease(before, 'r', new Set(['r']))(rootMoved)).toBe(rootMoved);
  });
});
