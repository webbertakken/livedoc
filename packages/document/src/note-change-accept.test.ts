// Accepting a note change (docs/specs/021-event-storming/suggested-changes.md "A reword ripples", "Accepting").
import { describe, expect, it } from 'vitest';
import { CONTEXT_NAME_MAX, type CandidateContextElement } from './candidate-contexts';
import { ES_NOTE_GAP } from './event-storming-lanes';
import {
  acceptKindChange,
  acceptRemoval,
  acceptReword,
  acceptSplit,
  rewordRipple,
} from './note-change-accept';
import type { EsNoteChange, EsRewordChange } from './note-changes';
import type { Element, StickyElement } from './index';

const note = (
  id: string,
  label: string,
  x: number,
  extra: Partial<StickyElement> = {},
): StickyElement => ({
  id,
  type: 'sticky',
  x,
  y: 0,
  width: 200,
  height: 200,
  label,
  esKind: 'domain-event',
  ...extra,
});

const context = (id: string, label: string, notes: string[]): CandidateContextElement => ({
  id,
  type: 'shape',
  shape: 'square',
  x: 0,
  y: 0,
  width: 1,
  height: 1,
  label,
  esContext: { notes },
});

const reword: EsRewordChange = {
  change: 'reword',
  words: 'Booking Created',
  term: 'Order',
  to: 'Booking',
};

// "Order" is said in Ordering (created, closed), in Kitchen (orders received) and by a note in no context.
const board = (changes: EsNoteChange[] = [reword]): Element[] => [
  note('created', 'Order Created', 0, { esChanges: changes }),
  note('closed', 'Order Closed', 300),
  note('paid', 'Payment Taken', 600),
  note('received', 'Orders received', 900),
  note('loose', 'Reorder stock when an order ships', 1200),
  context('ordering', 'Order desk', ['created', 'closed', 'paid']),
  context('kitchen', 'Kitchen', ['received']),
];

const labelOf = (els: Element[], id: string) =>
  (els.find((el) => el.id === id) as StickyElement).label;
const el = (els: Element[], id: string) => els.find((e) => e.id === id) as StickyElement;

describe('rewordRipple', () => {
  it('reaches the notes of the note’s own context and that context’s name', () => {
    expect(rewordRipple(board(), 'created', reword, 'context')).toEqual({
      notes: [{ id: 'closed', words: 'Booking Closed' }],
      contexts: [{ id: 'ordering', name: 'Booking desk' }],
      beyond: 2,
    });
  });

  it('reaches every note and context name on the board', () => {
    const everywhere = [...board(), context('late', 'Late orders', ['loose'])];
    expect(rewordRipple(everywhere, 'created', reword, 'board')).toEqual({
      notes: [
        { id: 'closed', words: 'Booking Closed' },
        { id: 'received', words: 'Bookings received' },
        { id: 'loose', words: 'Reorder stock when an booking ships' },
      ],
      contexts: [
        { id: 'ordering', name: 'Booking desk' },
        { id: 'late', name: 'Late bookings' },
      ],
      beyond: 0,
    });
  });

  it('for a note in no context, reaches the notes in no context', () => {
    const els = [...board([]), note('stray', 'Order lost', 1500, { esChanges: [reword] })];
    expect(rewordRipple(els, 'stray', reword, 'context')).toEqual({
      notes: [{ id: 'loose', words: 'Reorder stock when an booking ships' }],
      contexts: [],
      beyond: 3,
    });
  });

  it('ripples nowhere without a term', () => {
    const plain: EsRewordChange = { change: 'reword', words: 'Booking Created' };
    expect(rewordRipple(board([plain]), 'created', plain, 'board')).toEqual({
      notes: [],
      contexts: [],
      beyond: 0,
    });
  });

  it('never reaches a suggestion or a plain sticky', () => {
    const els = [
      ...board(),
      note('hint', 'Order Shipped', 300, { esSuggestion: { anchorId: 'created', side: 'after' } }),
      note('plain', 'Order of the day', 1500, { esKind: undefined }),
    ];
    expect(rewordRipple(els, 'created', reword, 'board').notes.map((n) => n.id)).toEqual([
      'closed',
      'received',
      'loose',
    ]);
  });

  it('cuts a context name the new term makes too long', () => {
    const long: EsRewordChange = { ...reword, to: 'B'.repeat(CONTEXT_NAME_MAX) };
    expect(rewordRipple(board([long]), 'created', long, 'context').contexts[0]!.name).toHaveLength(
      CONTEXT_NAME_MAX,
    );
  });
});

describe('acceptReword', () => {
  it('rewords the note and ripples through its context first', () => {
    const out = acceptReword(board(), 'created', reword, 'context');
    expect(labelOf(out, 'created')).toBe('Booking Created');
    expect(labelOf(out, 'closed')).toBe('Booking Closed');
    expect(labelOf(out, 'ordering')).toBe('Booking desk');
    expect(labelOf(out, 'received')).toBe('Orders received');
    expect(labelOf(out, 'loose')).toBe('Reorder stock when an order ships');
  });

  it('rewords everywhere when asked', () => {
    const out = acceptReword(board(), 'created', reword, 'board');
    expect(labelOf(out, 'received')).toBe('Bookings received');
    expect(labelOf(out, 'loose')).toBe('Reorder stock when an booking ships');
  });

  it('drops the note’s rewords and keeps its other changes', () => {
    const other: EsNoteChange = { change: 'reword', words: 'Order Made' };
    const kind: EsNoteChange = { change: 'kind', kind: 'command' };
    const out = acceptReword(board([other, reword, kind]), 'created', reword, 'context');
    expect(el(out, 'created').esChanges).toEqual([kind]);
  });

  it('drops the formatting of the labels it rewrites', () => {
    const els = board();
    (els[0] as StickyElement).richText = [{ text: 'Order ' }, { text: 'Created', bold: true }];
    (els[1] as StickyElement).richText = [{ text: 'Order Closed', italic: true }];
    const out = acceptReword(els, 'created', reword, 'context');
    expect(out[0]).not.toHaveProperty('richText');
    expect(out[1]).not.toHaveProperty('richText');
  });

  it('changes nothing when the note no longer holds that reword', () => {
    const els = board([]);
    expect(acceptReword(els, 'created', reword, 'context')).toBe(els);
    expect(acceptReword(els, 'nope', reword, 'context')).toBe(els);
  });
});

describe('acceptKindChange', () => {
  const kind: EsNoteChange = { change: 'kind', kind: 'command' };

  it('changes the kind as Change Kind does and drops the note’s kind changes', () => {
    const other: EsNoteChange = { change: 'kind', kind: 'policy' };
    const out = acceptKindChange(board([kind, other, reword]), 'created', kind);
    expect(el(out, 'created').esKind).toBe('command');
    expect(el(out, 'created').esChanges).toEqual([reword]);
  });

  it('changes nothing when the note no longer holds that change', () => {
    const els = board();
    expect(acceptKindChange(els, 'created', kind)).toBe(els);
  });
});

describe('acceptSplit', () => {
  const split: EsNoteChange = {
    change: 'split',
    parts: ['Order Created', 'Order Paid', 'Order Sent'],
    by: 'Ada',
  };
  const ids = () => {
    let n = 0;
    return () => `part-${(n += 1)}`;
  };

  it('keeps the first part on the note and chains the others after it as suggestions', () => {
    const out = acceptSplit(board([split, reword]), 'created', split, ids());
    expect(out.partIds).toEqual(['part-1', 'part-2']);
    expect(labelOf(out.elements, 'created')).toBe('Order Created');
    expect(el(out.elements, 'created').esChanges).toEqual([reword]);
    const [second, third] = out.partIds.map((id) => el(out.elements, id));
    expect(second).toMatchObject({
      label: 'Order Paid',
      esKind: 'domain-event',
      x: 200 + ES_NOTE_GAP,
      esSuggestion: { anchorId: 'created', side: 'after', by: 'Ada' },
    });
    expect(third).toMatchObject({
      label: 'Order Sent',
      esSuggestion: { anchorId: 'part-1', side: 'after' },
    });
  });

  it('puts the parts on the note’s layer', () => {
    const els = [note('n', 'One and two', 0, { layerId: 'board', esChanges: [split] })];
    const out = acceptSplit(els, 'n', split, ids());
    expect(el(out.elements, 'part-1').layerId).toBe('board');
  });

  it('changes nothing when the note no longer holds that split', () => {
    const els = board();
    expect(acceptSplit(els, 'created', split, ids())).toEqual({ elements: els, partIds: [] });
  });
});

describe('acceptRemoval', () => {
  const remove: EsNoteChange = { change: 'remove' };

  it('removes the note with what was suggested on it', () => {
    const els = [
      ...board([remove]),
      note('hint', 'Order Shipped', 300, { esSuggestion: { anchorId: 'created', side: 'after' } }),
    ];
    const out = acceptRemoval(els, 'created');
    expect(out.map((e) => e.id)).toEqual([
      'closed',
      'paid',
      'received',
      'loose',
      'ordering',
      'kitchen',
    ]);
  });

  it('takes a context it empties, and the names that named it', () => {
    const els: Element[] = [
      note('only', 'Meal Cooked', 0, { esChanges: [remove] }),
      note('other', 'Order Placed', 300),
      context('kitchen', 'Kitchen', ['only']),
      {
        ...context('ordering', 'Ordering', ['other']),
        esContext: { notes: ['other'], names: [{ name: 'Shop', with: ['kitchen'] }] },
      },
    ];
    const out = acceptRemoval(els, 'only');
    expect(out.map((e) => e.id)).toEqual(['other', 'ordering']);
    expect((out[1] as CandidateContextElement).esContext).toEqual({ notes: ['other'] });
  });

  it('changes nothing when the note no longer holds a removal', () => {
    const els = board();
    expect(acceptRemoval(els, 'created')).toBe(els);
  });
});
