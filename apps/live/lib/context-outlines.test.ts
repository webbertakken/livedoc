import { describe, expect, it } from 'vitest';
import { CONTEXT_PADDING_PX, type CandidateContextElement, type Element } from '@livedoc/document';
import { drawnContexts, type DrawnContextsInput } from './context-outlines';

// docs/specs/021-event-storming/candidate-contexts.md "Its outline, exactly" and "Joining and leaving, exactly".

const note = (id: string, x: number): Element => ({
  id,
  type: 'sticky',
  x,
  y: 0,
  width: 200,
  height: 200,
  label: id,
  esKind: 'domain-event',
});
const context = (id: string, notes: string[], suggested = false): CandidateContextElement => ({
  id,
  type: 'shape',
  shape: 'square',
  x: 0,
  y: 0,
  width: 1,
  height: 1,
  label: id,
  esContext: { notes, ...(suggested ? { suggestion: { reason: 'r' } } : {}) },
});

const board: Element[] = [
  note('a', 0),
  note('b', 300),
  note('c', 2000),
  context('k', ['a', 'b']),
  context('s', ['c'], true),
];
const input = (over: Partial<DrawnContextsInput> = {}): DrawnContextsInput => ({
  committed: board,
  drawn: board,
  hidden: new Set(),
  shiftX: () => undefined,
  draggedIds: new Set(),
  showSuggested: true,
  ...over,
});

describe('drawnContexts', () => {
  it('draws each context round its notes, suggested ones marked', () => {
    const drawn = drawnContexts(input());
    expect(drawn.map((d) => [d.context.id, d.suggested, d.notes, d.highlighted])).toEqual([
      ['k', false, 2, false],
      ['s', true, 1, false],
    ]);
    expect(drawn[0]!.outline.bounds.x).toBe(-CONTEXT_PADDING_PX);
  });

  it('draws no suggested context for someone who does not see suggestions', () => {
    expect(drawnContexts(input({ showSuggested: false })).map((d) => d.context.id)).toEqual(['k']);
  });

  it('counts only the notes on visible layers, and draws none with none showing', () => {
    expect(drawnContexts(input({ hidden: new Set(['b']) }))[0]!.notes).toBe(1);
    expect(
      drawnContexts(input({ hidden: new Set(['a', 'b', 'c']) })).map((d) => d.context.id),
    ).toEqual([]);
  });

  it('follows the notes as they are drawn: shifted along the timeline', () => {
    const drawn = drawnContexts(input({ shiftX: (id) => (id === 'a' ? 100 : undefined) }));
    expect(drawn[0]!.outline.bounds.x).toBe(100 - CONTEXT_PADDING_PX);
  });

  it('draws the outcome of a drag in hand, highlighting the outline a note would join', () => {
    const drawn = board.map((el) => (el.id === 'c' ? { ...el, x: 150 } : el));
    const out = drawnContexts(input({ drawn, draggedIds: new Set(['c']) }));
    const k = out.find((d) => d.context.id === 'k')!;
    expect(k.highlighted).toBe(true);
    expect(k.notes).toBe(3);
    // The suggested context lost its only note to the kept one.
    expect(out.find((d) => d.context.id === 's')).toBeUndefined();
  });
});
