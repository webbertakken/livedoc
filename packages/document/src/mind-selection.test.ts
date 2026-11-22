import { describe, expect, it } from 'vitest';
import { createPinnedArrow, createShape } from './factories';
import { mindSelectionChoices, mindSelectionNodes } from './mind-selection';
import type { Element, ShapeElement } from './index';

// docs/specs/009-elements/mind-node.md "Several nodes selected": a selection of mind nodes, with or without the lines
// between them, is a mind selection; any other element makes it a mixed one.

const node = (id: string, over: Partial<ShapeElement> = {}): ShapeElement => ({
  ...createShape('mind-node', 0, 0),
  id,
  ...over,
});
const line = (from: string, to: string, id = `${from}-${to}`): Element => ({
  ...createPinnedArrow(from, 'e', to, 'w'),
  id,
});

const r = node('r', { mindFlow: 'tree' });
const a = node('a', { mindParentId: 'r' });
const b = node('b', { mindParentId: 'r', mindFlow: 'downward' });
const q = node('q', { mindFlow: 'downward', mindSpacing: 'wide' });
const square = { ...createShape('square', 0, 0), id: 'sq' } as Element;
const all: Element[] = [r, a, b, q, square, line('r', 'a'), line('r', 'b'), line('a', 'sq')];
const pick = (...ids: string[]) => all.filter((e) => ids.includes(e.id));

describe('mindSelectionNodes', () => {
  it('reads several mind nodes as a mind selection', () => {
    expect(mindSelectionNodes(all, pick('a', 'b'))?.map((n) => n.id)).toEqual(['a', 'b']);
  });

  it('carries the lines between mind nodes along, never as another kind', () => {
    expect(mindSelectionNodes(all, pick('r', 'a', 'b', 'r-a', 'r-b'))?.map((n) => n.id)).toEqual([
      'r',
      'a',
      'b',
    ]);
  });

  it('is no mind selection with any other element in it', () => {
    expect(mindSelectionNodes(all, pick('a', 'b', 'sq'))).toBeNull();
    expect(mindSelectionNodes(all, pick('a', 'a-sq'))).toBeNull();
  });

  it('is no mind selection with no node in it', () => {
    expect(mindSelectionNodes(all, pick('r-a'))).toBeNull();
    expect(mindSelectionNodes(all, [])).toBeNull();
  });
});

describe('mindSelectionChoices', () => {
  it('offers the rows every node offers, ticking the one they share', () => {
    const deeper = mindSelectionChoices(all, [a, node('a2', { mindParentId: 'r' })]);
    expect(deeper.flowRows[0]).toBe('auto');
    expect(deeper.flow).toBe('auto');
  });

  it('ticks no direction when the nodes differ', () => {
    expect(mindSelectionChoices(all, [a, b]).flow).toBeNull();
  });

  it('offers a root and a deeper node only the rows both can take', () => {
    const rows = mindSelectionChoices(all, [r, a]).flowRows;
    expect(rows).not.toContain('auto');
    expect(rows).not.toContain('balanced');
    expect(rows).toContain('downward');
  });

  it('ticks the spacing every map shares, or none', () => {
    expect(mindSelectionChoices(all, [a, b]).spacing).toBe('comfortable');
    expect(mindSelectionChoices(all, [a, q]).spacing).toBeNull();
  });

  it('names the one map every node is in, or none', () => {
    expect(mindSelectionChoices(all, [a, b]).mapRoot?.id).toBe('r');
    expect(mindSelectionChoices(all, [a, q]).mapRoot).toBeNull();
  });
});
