// docs/specs/029-sheets/review.md "In the grid", "Where a thread lives", D653: the open threads by their anchor's
// top-left cell, a new thread's anchor from a selection, reading order, stepping, and a refusal's words.
import { describe, expect, it } from 'vitest';
import type { SheetThread } from '@livedoc/document';
import {
  anchorCellKey,
  anchorOfRange,
  moreCommentsLabel,
  openThreadsByCell,
  steppedThread,
  threadRefusalWords,
  threadsInReadingOrder,
} from './sheet-comments';

const layout = { rows: ['r0', 'r1', 'r2', 'r3'], cols: ['c0', 'c1', 'c2'] };
const said = (at: number) => ({
  id: `c${at}`,
  text: 'x',
  at,
  author: { name: 'Ada', colour: '#000' },
});
const thread = (
  id: string,
  r: string,
  c: string,
  extra: Partial<SheetThread> = {},
): SheetThread => ({
  id,
  sheetId: 's1',
  anchor: { r1: r, c1: c, r2: r, c2: c },
  resolved: false,
  comments: [said(1)],
  v: 1,
  ...extra,
});

describe('openThreadsByCell', () => {
  it('keys the sheet’s open threads by their top-left cell, the first begun where two share one', () => {
    const later = thread('later', 'r1', 'c1', { comments: [said(9)] });
    const first = thread('first', 'r1', 'c1', { comments: [said(2)] });
    const map = openThreadsByCell(
      [
        later,
        first,
        thread('third', 'r1', 'c1', { comments: [said(20)] }),
        thread('done', 'r0', 'c0', { resolved: true }),
        thread('other', 'r0', 'c0', { sheetId: 's2' }),
        thread('empty', 'r2', 'c2', { comments: [] }),
      ],
      's1',
    );
    expect([...map.keys()]).toEqual(['r1:c1', 'r2:c2']);
    expect(map.get('r1:c1')).toBe(first);
    expect(anchorCellKey(first.anchor)).toBe('r1:c1');
    // One begun earlier than one with no comments yet keeps its place.
    expect(openThreadsByCell([thread('a', 'r0', 'c0', { comments: [] }), first], 's1').size).toBe(
      2,
    );
  });
});

describe('anchorOfRange', () => {
  const noMerge = () => null;
  it('anchors a range by its corners’ ids', () => {
    expect(anchorOfRange(layout, { r1: 1, c1: 0, r2: 2, c2: 1 }, noMerge)).toEqual({
      r1: 'r1',
      c1: 'c0',
      r2: 'r2',
      c2: 'c1',
    });
  });

  it('takes a merged area at its top-left whole', () => {
    const merged = { r1: 0, c1: 0, r2: 1, c2: 1 };
    expect(anchorOfRange(layout, { r1: 1, c1: 1, r2: 1, c2: 1 }, () => merged)).toEqual({
      r1: 'r0',
      c1: 'c0',
      r2: 'r1',
      c2: 'c1',
    });
  });

  it('answers none for a range off the sheet', () => {
    expect(anchorOfRange(layout, { r1: 0, c1: 0, r2: 9, c2: 0 }, noMerge)).toBeNull();
    expect(anchorOfRange(layout, { r1: 0, c1: 0, r2: 0, c2: 9 }, noMerge)).toBeNull();
    expect(anchorOfRange(layout, { r1: 9, c1: 0, r2: 9, c2: 0 }, noMerge)).toBeNull();
    expect(anchorOfRange(layout, { r1: 0, c1: 9, r2: 0, c2: 9 }, noMerge)).toBeNull();
  });
});

describe('reading order', () => {
  const byCell = openThreadsByCell(
    [
      thread('b', 'r2', 'c0'),
      thread('a', 'r0', 'c2'),
      thread('c', 'r2', 'c1'),
      // Its row deleted (D653): no place in the order.
      thread('gone', 'rX', 'c0'),
    ],
    's1',
  );
  const ordered = threadsInReadingOrder(layout, byCell);

  it('orders a sheet’s placed threads by rows, then columns', () => {
    expect(ordered.map((t) => t.thread.id)).toEqual(['a', 'b', 'c']);
    expect(ordered[0]!.range).toEqual({ r1: 0, c1: 2, r2: 0, c2: 2 });
  });

  it('steps past the cell itself, wrapping at either end', () => {
    const id = (t: { thread: SheetThread } | null) => t?.thread.id;
    expect(id(steppedThread(ordered, { r: 0, c: 0 }, true))).toBe('a');
    expect(id(steppedThread(ordered, { r: 2, c: 0 }, true))).toBe('c');
    expect(id(steppedThread(ordered, { r: 2, c: 1 }, true))).toBe('a');
    expect(id(steppedThread(ordered, { r: 2, c: 1 }, false))).toBe('b');
    expect(id(steppedThread(ordered, { r: 0, c: 2 }, false))).toBe('c');
    expect(id(steppedThread(ordered, { r: 0, c: 1 }, false))).toBe('c');
    expect(steppedThread([], { r: 0, c: 0 }, true)).toBeNull();
    expect(steppedThread([], { r: 0, c: 0 }, false)).toBeNull();
  });
});

describe('threadRefusalWords', () => {
  it('tells each refusal in its own words, anything else as a failed send', () => {
    expect(
      ['thread_gone', 'threads_full', 'thread_full', 'forbidden', 'thread_invalid', 'network'].map(
        threadRefusalWords,
      ),
    ).toEqual([
      'That comment is no longer there',
      'This sheet holds the most comments it can',
      'This comment thread holds the most replies it can',
      'You can no longer comment on this spreadsheet',
      'That comment could not be saved',
      'Your comment could not be sent. Try again.',
    ]);
  });
});

describe('moreCommentsLabel', () => {
  it('counts the comments after the first', () => {
    expect(moreCommentsLabel(thread('a', 'r0', 'c0'))).toBeNull();
    expect(
      moreCommentsLabel(thread('a', 'r0', 'c0', { comments: [said(1), said(2), said(3)] })),
    ).toBe('2 more');
  });
});
