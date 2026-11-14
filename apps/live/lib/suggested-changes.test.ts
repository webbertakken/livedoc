import { describe, expect, it } from 'vitest';
import { removeContexts, type Element } from '@livedoc/document';
import {
  KIND,
  REMOVE,
  REWORD,
  SPLIT,
  STEP,
  changed,
  named,
  note,
  orderFlow,
} from './change-board.fixture';
import { changeMarks, changeRows, nameRows } from './suggested-changes';

// What a board's suggested changes are, for the canvas to draw
// (docs/specs/021-event-storming/suggested-changes.md "How a person sees and decides").

const NONE: ReadonlySet<string> = new Set();

describe('changeMarks', () => {
  it('lists each workshop note that holds a change, with its changes, along the timeline', () => {
    const board = changed(changed(orderFlow(), 'packed', SPLIT, REMOVE), 'place', KIND);
    const marks = changeMarks(board, NONE);
    expect(marks.map((m) => [m.note.id, m.kind, m.changes.length])).toEqual([
      ['place', 'command', 1],
      ['packed', 'domain-event', 2],
    ]);
    expect(marks[1]!.changes[0]).toEqual(SPLIT);
  });

  it('leaves out a locked note, a note on a hidden or locked layer and a note that is suggested', () => {
    const board = changed(
      changed(changed(orderFlow(), 'place', KIND), 'pack', REWORD),
      'sent',
      REMOVE,
    );
    const locked = board.map((el) => (el.id === 'place' ? { ...el, locked: true } : el));
    const suggested: Element[] = [
      ...locked,
      {
        ...note('s', 'Ship it', 9),
        esSuggestion: { anchorId: 'sent', side: 'after' },
        esChanges: [REMOVE],
      },
    ];
    expect(changeMarks(suggested, new Set(['pack'])).map((m) => m.note.id)).toEqual(['sent']);
  });

  it('answers nothing for a board that holds none', () => {
    expect(changeMarks(orderFlow(), NONE)).toEqual([]);
  });
});

describe('changeRows', () => {
  it('gives a row per change, with its place on the note and the box of the note', () => {
    const rows = changeRows(changed(orderFlow(), 'packed', SPLIT, REMOVE), NONE);
    expect(rows.map((r) => [r.note.id, r.index, r.change.change])).toEqual([
      ['packed', 0, 'split'],
      ['packed', 1, 'remove'],
    ]);
    expect(rows[0]!.bounds).toMatchObject({ x: 6 * STEP, width: 200, height: 200 });
    expect(rows[0]!.type).toBe('change');
  });

  it('counts the notes that hold a reword’s term beyond its context', () => {
    const [row] = changeRows(changed(orderFlow(), 'pack', REWORD), NONE);
    // "Place order", "Order placed" and "Refund the order" are outside Fulfilment.
    expect(row!.beyond).toBe(3);
    const [kind] = changeRows(changed(orderFlow(), 'pack', KIND), NONE);
    expect(kind!.beyond).toBe(0);
  });
});

describe('nameRows', () => {
  it('gives a Names row per context that holds names for itself, round its notes', () => {
    const rows = nameRows(named(orderFlow(), ['ordering'], 'Order taking', 'Sales'));
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row).toMatchObject({ type: 'names', bounds: { x: 0, width: STEP + 200 } });
    expect(row.type === 'names' && row.context.id).toBe('ordering');
    expect(row.names.map((n) => n.name)).toEqual(['Order taking', 'Sales']);
  });

  it('gives a Merge row per set of contexts a name was made for, round all their notes', () => {
    const board = named(
      named(orderFlow(), ['fulfilment', 'ordering'], 'Shop'),
      ['ordering'],
      'Sales',
    );
    const rows = nameRows(board);
    expect(rows.map((r) => r.type)).toEqual(['names', 'merge']);
    const merge = rows[1]!;
    expect(merge.type === 'merge' && merge.contexts.map((c) => c.id)).toEqual([
      'ordering',
      'fulfilment',
    ]);
    expect(merge.names.map((n) => n.name)).toEqual(['Shop']);
    expect(merge.bounds).toMatchObject({ x: 0, width: 7 * STEP + 200 });
  });

  it('leaves out a name for a context that is gone, and a context none of whose notes are left', () => {
    const merged = named(orderFlow(), ['ordering', 'fulfilment'], 'Shop');
    // The holder (Fulfilment, three notes) keeps the name while Ordering goes another way than removeContexts.
    const lingering = merged.filter((el) => el.id !== 'ordering');
    expect(nameRows(lingering)).toEqual([]);
    expect(nameRows(removeContexts(merged, ['ordering']))).toEqual([]);
    const emptied = named(orderFlow(), ['ordering'], 'Sales').filter(
      (el) => el.id !== 'place' && el.id !== 'placed',
    );
    expect(nameRows(emptied)).toEqual([]);
  });
});
