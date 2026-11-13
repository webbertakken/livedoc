import { describe, expect, it } from 'vitest';
import {
  CONTEXT_LEAVE_PX,
  CONTEXT_PADDING_PX,
  type CandidateContextElement,
  type Element,
} from '@livedoc/document';
import { applyContextDrop, contextDropPlan, NO_CONTEXT_DROP } from './context-drop';

// docs/specs/021-event-storming/candidate-contexts.md "Joining and leaving, exactly".

const note = (id: string, x: number, y = 0, extra: Record<string, unknown> = {}): Element => ({
  id,
  type: 'sticky',
  x,
  y,
  width: 200,
  height: 200,
  label: id,
  esKind: 'domain-event',
  ...extra,
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
  esContext: { notes, ...(suggested ? { suggestion: {} } : {}) },
});
const moved = (els: Element[], id: string, x: number, y = 0) =>
  els.map((el) => (el.id === id ? { ...el, x, y } : el));
const notesOf = (els: Element[], id: string) =>
  (els.find((el) => el.id === id) as CandidateContextElement | undefined)?.esContext.notes;

// Two contexts side by side: left holds a and b (0..500), right holds c and d (2000..2500); e is in none.
const board: Element[] = [
  note('a', 0),
  note('b', 300),
  note('c', 2000),
  note('d', 2300),
  note('e', 5000),
  context('left', ['a', 'b']),
  context('right', ['c', 'd']),
];

describe('contextDropPlan', () => {
  it('joins a note dropped inside another outline, leaving its own', () => {
    const plan = contextDropPlan(board, moved(board, 'b', 2150, 0), new Set(['b']));
    expect([...plan.joins]).toEqual([['b', 'right']]);
    expect(plan.leaves.size).toBe(0);
    const after = applyContextDrop(moved(board, 'b', 2150), plan);
    expect(notesOf(after, 'left')).toEqual(['a']);
    expect(notesOf(after, 'right')).toEqual(['c', 'd', 'b']);
  });

  it('joins a note in no context', () => {
    const plan = contextDropPlan(board, moved(board, 'e', 150, 0), new Set(['e']));
    expect([...plan.joins]).toEqual([['e', 'left']]);
  });

  it('keeps a note that stays near its own outline', () => {
    // b's own outline without it is a alone: 0..200, padded; dropped within the leave distance.
    const near = 200 + CONTEXT_PADDING_PX + CONTEXT_LEAVE_PX - 10;
    expect(contextDropPlan(board, moved(board, 'b', near), new Set(['b']))).toBe(NO_CONTEXT_DROP);
  });

  it('lets a note go when it lands clear of its own outline by more than the leave distance', () => {
    const far = 200 + CONTEXT_PADDING_PX + CONTEXT_LEAVE_PX + 10;
    const plan = contextDropPlan(board, moved(board, 'b', far), new Set(['b']));
    expect([...plan.leaves]).toEqual(['b']);
    expect(notesOf(applyContextDrop(moved(board, 'b', far), plan), 'left')).toEqual(['a']);
  });

  it('joins the smallest of two outlines it lands in', () => {
    const nested: Element[] = [
      note('x', 0),
      note('y', 1000),
      note('z', 400),
      note('n', 3000),
      context('big', ['x', 'y']),
      context('small', ['z']),
    ];
    const plan = contextDropPlan(nested, moved(nested, 'n', 420, 10), new Set(['n']));
    expect([...plan.joins]).toEqual([['n', 'small']]);
  });

  it('changes nothing when a whole context is dragged together', () => {
    const both = moved(moved(board, 'a', 900), 'b', 1200);
    expect(contextDropPlan(board, both, new Set(['a', 'b']))).toBe(NO_CONTEXT_DROP);
  });

  it('leaves suggested contexts alone, and passes over what is no note or did not move', () => {
    const withSuggested: Element[] = [...board, note('f', 8000), context('s', ['f'], true)];
    // Dropped inside the suggested outline: it takes no notes until applied.
    expect(contextDropPlan(withSuggested, moved(withSuggested, 'e', 8000), new Set(['e']))).toBe(
      NO_CONTEXT_DROP,
    );
    // A note of a suggested context dragged into a kept outline joins it.
    const plan = contextDropPlan(withSuggested, moved(withSuggested, 'f', 150), new Set(['f']));
    expect([...plan.joins]).toEqual([['f', 'left']]);
    const plain = [...board, note('p', 9000, 0, { esKind: undefined })];
    expect(contextDropPlan(plain, moved(plain, 'p', 150), new Set(['p']))).toBe(NO_CONTEXT_DROP);
    expect(contextDropPlan(board, board, new Set(['a']))).toBe(NO_CONTEXT_DROP);
  });

  it('has nothing to do on a board without kept contexts, or with nothing dragged', () => {
    const bare = [note('a', 0), note('b', 300)];
    expect(contextDropPlan(bare, moved(bare, 'a', 900), new Set(['a']))).toBe(NO_CONTEXT_DROP);
    expect(contextDropPlan(board, board, new Set())).toBe(NO_CONTEXT_DROP);
  });
});

describe('applyContextDrop', () => {
  it('writes nothing for no plan', () => {
    expect(applyContextDrop(board, NO_CONTEXT_DROP)).toBe(board);
  });

  it('takes several notes into one context at once', () => {
    const plan = {
      joins: new Map([
        ['a', 'right'],
        ['b', 'right'],
      ]),
      leaves: new Set<string>(),
    };
    const after = applyContextDrop(board, plan);
    expect(notesOf(after, 'right')).toEqual(['c', 'd', 'a', 'b']);
    expect(notesOf(after, 'left')).toBeUndefined();
  });
});
