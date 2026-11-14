import { describe, expect, it } from 'vitest';
import { type CandidateContextElement, type Element } from '@livedoc/document';
import { contextForArrival, joinArrival } from './context-arrival';

// docs/specs/021-event-storming/candidate-contexts.md "Arriving in a context".

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
const notesOf = (els: Element[], id: string) =>
  (els.find((el) => el.id === id) as CandidateContextElement | undefined)?.esContext.notes;

// Left holds a and b (0..500), the suggested right holds c and d (2000..2500); o is in none (5000).
const base: Element[] = [
  note('a', 0),
  note('b', 300),
  note('c', 2000),
  note('d', 2300),
  note('o', 5000),
  context('left', ['a', 'b']),
  context('right', ['c', 'd'], true),
];
const withNew = (x: number, y = 0, extra: Record<string, unknown> = {}) => [
  ...base,
  note('n', x, y, extra),
];

describe('contextForArrival', () => {
  it('joins the context of the note it is added beside, even outside its outline', () => {
    expect(contextForArrival(withNew(516), 'n', { beside: 'b' })).toBe('left');
  });

  it('joins a suggested context as a kept one', () => {
    expect(contextForArrival(withNew(2516), 'n', { beside: 'd' })).toBe('right');
  });

  it('joins the context two notes it lands between share', () => {
    expect(contextForArrival(withNew(2216), 'n', { between: ['c', 'd'] })).toBe('right');
  });

  it('falls back to the outline holding its centre when the notes either side share none', () => {
    expect(contextForArrival(withNew(150, 10), 'n', { between: ['a', 'o'] })).toBe('left');
    expect(contextForArrival(withNew(1000), 'n', { between: ['b', 'c'] })).toBeNull();
  });

  it('falls back to the outline when the note beside is in no context', () => {
    expect(contextForArrival(withNew(5216), 'n', { beside: 'o' })).toBeNull();
    expect(contextForArrival(withNew(2150, 10), 'n', { beside: 'o' })).toBe('right');
  });

  it('joins the smallest outline holding its centre when placed with no note beside', () => {
    const nested: Element[] = [
      note('x', 0),
      note('y', 1000),
      note('z', 400),
      context('big', ['x', 'y']),
      context('small', ['z']),
      note('n', 420, 10),
    ];
    expect(contextForArrival(nested, 'n', {})).toBe('small');
    expect(contextForArrival(withNew(1200), 'n', {})).toBeNull();
  });

  it('keeps a note a context already names, and takes no plain sticky or missing note', () => {
    const named = [...base.slice(0, -1), context('right', ['c', 'd', 'n'], true), note('n', 150)];
    expect(contextForArrival(named, 'n', {})).toBeNull();
    expect(contextForArrival(withNew(150, 10, { esKind: undefined }), 'n', {})).toBeNull();
    expect(contextForArrival(base, 'n', {})).toBeNull();
  });
});

describe('joinArrival', () => {
  it('writes the note into the context it arrives in', () => {
    const after = joinArrival(withNew(516), 'n', { beside: 'b' });
    expect(notesOf(after, 'left')).toEqual(['a', 'b', 'n']);
    expect(notesOf(after, 'right')).toEqual(['c', 'd']);
  });

  it('answers the same board when the note arrives in none', () => {
    const board = withNew(9000);
    expect(joinArrival(board, 'n', {})).toBe(board);
  });
});
