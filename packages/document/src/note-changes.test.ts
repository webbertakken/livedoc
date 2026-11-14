// Note changes (docs/specs/021-event-storming/suggested-changes.md "Note changes").
import { describe, expect, it } from 'vitest';
import { changeEventStormingKind } from './event-storming';
import { SUGGESTION_BY_MAX, SUGGESTION_REASON_MAX } from './event-storming-suggestions';
import {
  NOTE_CHANGES_MAX,
  NOTE_CHANGE_WORDS_MAX,
  SPLIT_PARTS_MAX,
  addNoteChange,
  dismissNoteChange,
  isValidEsChanges,
  noteChangesOf,
  openNoteChanges,
  sameNoteChange,
  withoutNoteChanges,
  type EsNoteChange,
} from './note-changes';
import { elementValidationIssue } from './validate';
import type { Element, StickyElement } from './index';

const note = (id: string, extra: Partial<StickyElement> = {}): StickyElement => ({
  id,
  type: 'sticky',
  x: 0,
  y: 0,
  width: 200,
  height: 200,
  label: 'Order Created',
  esKind: 'domain-event',
  ...extra,
});

const reword: EsNoteChange = { change: 'reword', words: 'Booking Created' };
const kind: EsNoteChange = { change: 'kind', kind: 'command' };
const split: EsNoteChange = { change: 'split', parts: ['Order Created', 'Order Paid'] };
const remove: EsNoteChange = { change: 'remove' };

const changesOn = (els: Element[], id: string) =>
  (els.find((el) => el.id === id) as StickyElement).esChanges;

describe('isValidEsChanges', () => {
  it('takes each of the four changes, with who and why', () => {
    expect(
      isValidEsChanges([
        { ...reword, term: 'Order', to: 'Booking', reason: 'their word', by: 'Ada' },
        kind,
        split,
        remove,
      ]),
    ).toBe(true);
    expect(isValidEsChanges([])).toBe(true);
  });

  it('refuses anything that is not a list of changes, or more than a note may hold', () => {
    expect(isValidEsChanges(reword)).toBe(false);
    expect(isValidEsChanges([null])).toBe(false);
    expect(isValidEsChanges([{ change: 'paint' }])).toBe(false);
    expect(isValidEsChanges(Array.from({ length: NOTE_CHANGES_MAX + 1 }, () => remove))).toBe(
      false,
    );
  });

  it('refuses a reword with no words, too many, or half a term', () => {
    expect(isValidEsChanges([{ change: 'reword' }])).toBe(false);
    expect(isValidEsChanges([{ change: 'reword', words: '  ' }])).toBe(false);
    expect(
      isValidEsChanges([{ change: 'reword', words: 'x'.repeat(NOTE_CHANGE_WORDS_MAX + 1) }]),
    ).toBe(false);
    expect(isValidEsChanges([{ ...reword, term: 'Order' }])).toBe(false);
    expect(isValidEsChanges([{ ...reword, to: 'Booking' }])).toBe(false);
    expect(isValidEsChanges([{ ...reword, term: ' ', to: 'Booking' }])).toBe(false);
  });

  it('refuses a kind that is no note kind', () => {
    expect(isValidEsChanges([{ change: 'kind', kind: 'sticky' }])).toBe(false);
    expect(isValidEsChanges([{ change: 'kind' }])).toBe(false);
  });

  it('refuses a split of fewer than two parts, too many, or a blank one', () => {
    expect(isValidEsChanges([{ change: 'split', parts: ['One'] }])).toBe(false);
    expect(isValidEsChanges([{ change: 'split', parts: 'One Two' }])).toBe(false);
    expect(isValidEsChanges([{ change: 'split', parts: ['One', ' '] }])).toBe(false);
    expect(isValidEsChanges([{ change: 'split', parts: ['One', 7] }])).toBe(false);
    expect(
      isValidEsChanges([
        { change: 'split', parts: Array.from({ length: SPLIT_PARTS_MAX + 1 }, () => 'Part') },
      ]),
    ).toBe(false);
  });

  it('refuses a reason or a name past its limit', () => {
    expect(isValidEsChanges([{ ...remove, reason: 'x'.repeat(SUGGESTION_REASON_MAX + 1) }])).toBe(
      false,
    );
    expect(isValidEsChanges([{ ...remove, by: 'x'.repeat(SUGGESTION_BY_MAX + 1) }])).toBe(false);
  });
});

describe('validate (a note that holds changes)', () => {
  it('accepts valid changes and names the field for invalid ones', () => {
    expect(elementValidationIssue(note('a', { esChanges: [reword] }))).toBeNull();
    expect(
      elementValidationIssue(note('a', { esChanges: [{ change: 'paint' }] as never }))?.field,
    ).toBe('esChanges');
  });
});

describe('noteChangesOf', () => {
  it('reads the changes a workshop note holds', () => {
    expect(noteChangesOf(note('a', { esChanges: [reword, kind] }))).toEqual([reword, kind]);
    expect(noteChangesOf(note('a'))).toEqual([]);
  });

  it('reads none on a suggestion, a plain sticky or a field that is not a list', () => {
    const suggested = note('s', {
      esChanges: [reword],
      esSuggestion: { anchorId: 'a', side: 'after' },
    });
    expect(noteChangesOf(suggested)).toEqual([]);
    expect(noteChangesOf(note('p', { esKind: undefined, esChanges: [reword] }))).toEqual([]);
    expect(noteChangesOf(note('a', { esChanges: 'reword' as never }))).toEqual([]);
    const text: Element = { id: 't', type: 'text', x: 0, y: 0, width: 1, height: 1 };
    expect(noteChangesOf(text)).toEqual([]);
  });

  it('leaves out an entry that is no change', () => {
    expect(noteChangesOf(note('a', { esChanges: [{ change: 'paint' } as never, remove] }))).toEqual(
      [remove],
    );
  });
});

describe('sameNoteChange', () => {
  it('compares rewords by their words, ignoring case, punctuation and spacing', () => {
    expect(sameNoteChange(reword, { change: 'reword', words: ' booking  created. ' })).toBe(true);
    expect(sameNoteChange(reword, { change: 'reword', words: 'Booking Made' })).toBe(false);
  });

  it('compares kinds, splits part by part, and any two removals', () => {
    expect(sameNoteChange(kind, { change: 'kind', kind: 'command' })).toBe(true);
    expect(sameNoteChange(kind, { change: 'kind', kind: 'policy' })).toBe(false);
    expect(sameNoteChange(split, { change: 'split', parts: ['order created', 'ORDER PAID'] })).toBe(
      true,
    );
    expect(sameNoteChange(split, { change: 'split', parts: ['Order Created'] as string[] })).toBe(
      false,
    );
    expect(sameNoteChange(split, { change: 'split', parts: ['Order Created', 'Order Sent'] })).toBe(
      false,
    );
    expect(sameNoteChange(remove, { change: 'remove', reason: 'a duplicate' })).toBe(true);
  });

  it('never matches two different changes', () => {
    expect(sameNoteChange(reword, remove)).toBe(false);
  });
});

describe('addNoteChange', () => {
  it('appends a change to a workshop note', () => {
    const out = addNoteChange([note('a', { esChanges: [kind] })], 'a', reword);
    expect(changesOn(out, 'a')).toEqual([kind, reword]);
  });

  it('changes nothing for a note that is not there, not a workshop note, or full', () => {
    const els: Element[] = [note('a'), note('p', { esKind: undefined })];
    expect(addNoteChange(els, 'nope', reword)).toBe(els);
    expect(addNoteChange(els, 'p', reword)).toBe(els);
    const full: Element[] = [
      note('a', { esChanges: Array.from({ length: NOTE_CHANGES_MAX }, () => remove) }),
    ];
    expect(addNoteChange(full, 'a', reword)).toBe(full);
  });
});

describe('dismissNoteChange', () => {
  it('drops the change that matches and keeps the others', () => {
    const out = dismissNoteChange([note('a', { esChanges: [reword, kind] })], 'a', {
      change: 'reword',
      words: 'booking created',
    });
    expect(changesOn(out, 'a')).toEqual([kind]);
  });

  it('leaves no empty list behind', () => {
    const out = dismissNoteChange([note('a', { esChanges: [reword] })], 'a', reword);
    expect(out[0]).not.toHaveProperty('esChanges');
  });

  it('answers the same board when the note holds no such change', () => {
    const els: Element[] = [note('a', { esChanges: [kind] })];
    expect(dismissNoteChange(els, 'a', reword)).toBe(els);
    expect(dismissNoteChange(els, 'nope', kind)).toBe(els);
  });
});

describe('withoutNoteChanges', () => {
  it('drops every change a note holds', () => {
    const out = withoutNoteChanges([note('a', { esChanges: [reword, kind] }), note('b')], 'a');
    expect(out[0]).not.toHaveProperty('esChanges');
  });

  it('answers the same board for a note that holds none', () => {
    const els: Element[] = [note('a')];
    expect(withoutNoteChanges(els, 'a')).toBe(els);
  });
});

describe('openNoteChanges', () => {
  it('counts the changes on workshop notes only', () => {
    const els: Element[] = [
      note('a', { esChanges: [reword, kind] }),
      note('b', { esChanges: [remove] }),
      note('p', { esKind: undefined, esChanges: [remove] }),
    ];
    expect(openNoteChanges(els)).toBe(3);
  });
});

describe('a kind change that the note already is', () => {
  it('goes when the note changes kind by hand', () => {
    const el = note('a', { esChanges: [kind, reword, { change: 'kind', kind: 'policy' }] });
    expect(changeEventStormingKind(el, 'command').esChanges).toEqual([
      reword,
      { change: 'kind', kind: 'policy' },
    ]);
  });

  it('leaves no empty list behind', () => {
    expect(changeEventStormingKind(note('a', { esChanges: [kind] }), 'command')).not.toHaveProperty(
      'esChanges',
    );
  });
});
