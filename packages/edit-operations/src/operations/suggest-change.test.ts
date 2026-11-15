import { describe, expect, it } from 'vitest';
import {
  NOTE_CHANGES_MAX,
  NOTE_CHANGE_WORDS_MAX,
  SPLIT_PARTS_MAX,
  TERM_MAX,
  type StickyElement,
  type Tab,
} from '@livedoc/document';
import { formatOperation } from '../format-operation';
import { parseEditOperations } from '../parse';
import { checkoutFlow } from '../fixtures/checkout-flow';
import { applied, lines, refused } from '../fixtures/outcomes';
import { run } from '../fixtures/run';
import { inBoard, stormBoard } from '../fixtures/storm-board';

// docs/specs/021-event-storming/suggested-changes.md "Note changes".

const changesOn = (tab: Tab, id: string) => inBoard<StickyElement>(tab, id).esChanges;
const roundTrip = (line: string) => {
  const parsed = parseEditOperations(line);
  if (!('operations' in parsed)) throw new Error(JSON.stringify(parsed));
  return { operation: parsed.operations[0]!, printed: formatOperation(parsed.operations[0]!) };
};

describe('note changes: parsing', () => {
  it('reads a reword, with and without a term, and prints it back', () => {
    const line =
      'suggest-reword placed "Booking Placed" term="Order" to="Booking" reason="their word"';
    expect(roundTrip(line)).toEqual({
      operation: {
        op: 'suggest-reword',
        note: 'placed',
        words: 'Booking Placed',
        term: 'Order',
        to: 'Booking',
        reason: 'their word',
      },
      printed: line,
    });
    expect(roundTrip('suggest-reword "Order Placed" "Order Made"')).toEqual({
      operation: { op: 'suggest-reword', note: '"Order Placed"', words: 'Order Made' },
      printed: 'suggest-reword "Order Placed" "Order Made"',
    });
  });

  it('reads a kind change, a split and a removal, and prints them back', () => {
    expect(roundTrip('suggest-kind placed command reason="an intent"')).toEqual({
      operation: { op: 'suggest-kind', note: 'placed', kind: 'command', reason: 'an intent' },
      printed: 'suggest-kind placed command reason="an intent"',
    });
    expect(
      roundTrip('suggest-split placed "Order Placed" "Order Paid" reason="two facts"'),
    ).toEqual({
      operation: {
        op: 'suggest-split',
        note: 'placed',
        parts: ['Order Placed', 'Order Paid'],
        reason: 'two facts',
      },
      printed: 'suggest-split placed "Order Placed" "Order Paid" reason="two facts"',
    });
    expect(roundTrip('suggest-remove placed reason="a stray"')).toEqual({
      operation: { op: 'suggest-remove', note: 'placed', reason: 'a stray' },
      printed: 'suggest-remove placed reason="a stray"',
    });
    expect(roundTrip('suggest-remove placed').printed).toBe('suggest-remove placed');
  });

  it.each([
    ['suggest-reword', 'the note'],
    ['suggest-reword reason=x', 'the note'],
    ['suggest-reword placed', 'the new words'],
    ['suggest-reword placed "A" "B"', 'term=, to= or reason='],
    ['suggest-reword placed "A" fill=red', 'term=, to= or reason='],
    ['suggest-reword placed "A" fill=[1', 'a JSON value'],
    ['suggest-reword placed "A B" term=A', 'suggest-reword takes "term" and "to" together'],
    ['suggest-reword placed "A B" to=A', 'suggest-reword takes "term" and "to" together'],
    ['suggest-kind placed', 'a kind'],
    ['suggest-kind placed "command"', 'a kind'],
    ['suggest-kind placed command policy', 'reason='],
    ['suggest-split placed "A" "B" id=x', 'reason='],
    ['suggest-remove placed paid', 'reason='],
    ['suggest-remove', 'the note'],
  ])('refuses %s', (line, expected) => {
    const parsed = parseEditOperations(line);
    expect('errors' in parsed && parsed.errors[0]!.details.join(' ')).toContain(expected);
  });

  it('checks the JSON form', () => {
    const errorOf = (raw: object) => {
      const parsed = parseEditOperations(JSON.stringify(raw));
      return 'errors' in parsed ? parsed.errors[0]!.details[0] : 'parsed';
    };
    expect(errorOf({ op: 'suggest-split', note: 'a', parts: 'One Two' })).toContain(
      'member "parts": expected an array of strings',
    );
    expect(errorOf({ op: 'suggest-split', note: 'a', parts: ['One', 2] })).toContain(
      'member "parts"',
    );
    expect(errorOf({ op: 'suggest-reword', note: '', words: 'x' })).toContain('member "note"');
    expect(errorOf({ op: 'suggest-reword', note: 'a', words: 'x', term: 3, to: 'y' })).toContain(
      'member "term"',
    );
    expect(errorOf({ op: 'suggest-reword', note: 'a', words: 'x', term: 'y' })).toContain(
      'together',
    );
    expect(errorOf({ op: 'suggest-kind', note: 'a' })).toContain('member "kind"');
    expect(errorOf({ op: 'suggest-remove', note: 'a', words: 'x' })).toContain(
      'unknown member "words"',
    );
  });
});

describe('note changes: applying', () => {
  it('keeps a reword on its note and changes no word on the board', () => {
    const tab = stormBoard();
    const outcome = applied(
      run(
        'suggest-reword placed " Booking   Placed " term=Order to=Booking reason="their word"',
        tab,
        {
          agentName: 'Claude',
        },
      ),
    );
    expect(inBoard(outcome.tab, 'placed')).toMatchObject({
      label: 'Order Placed',
      esChanges: [
        {
          change: 'reword',
          words: 'Booking Placed',
          term: 'Order',
          to: 'Booking',
          reason: 'their word',
          by: 'Claude',
        },
      ],
    });
    expect(inBoard(outcome.tab, 'paid')).toBe(tab.elements[1]);
    expect(outcome.createdIds).toEqual([]);
    expect(lines(outcome)).toEqual(['~ placed  suggested reword "Booking Placed"']);
  });

  it('fills nothing in on the note: a suggestion changes nothing until it is accepted', () => {
    const outcome = run('suggest-remove old', stormBoard());
    expect(lines(outcome)).toEqual(['~ old  suggested remove']);
    expect('textSize' in inBoard(applied(outcome).tab, 'old')).toBe(false);
  });

  it('says each change in its result line', () => {
    const outcome = run(
      [
        'suggest-kind placed command',
        'suggest-split placed "Order Placed" "Order Confirmed"',
        'suggest-remove paid',
      ].join('\n'),
      stormBoard(),
    );
    expect(lines(outcome)).toEqual([
      '~ placed  suggested kind command, split "Order Placed" | "Order Confirmed"',
      '~ paid  suggested remove',
    ]);
  });

  it('keeps a kind change, a split and a removal beside it, in the order suggested', () => {
    const outcome = applied(
      run(
        [
          'suggest-kind placed command',
          'suggest-split placed "Order Placed" " Order  Confirmed "',
          'suggest-remove placed reason="said twice"',
        ].join('\n'),
        stormBoard(),
      ),
    );
    expect(changesOn(outcome.tab, 'placed')).toEqual([
      { change: 'kind', kind: 'command' },
      { change: 'split', parts: ['Order Placed', 'Order Confirmed'] },
      { change: 'remove', reason: 'said twice' },
    ]);
  });

  it.each([
    ['suggest-remove n1', checkoutFlow(), 'not_event_storming'],
    ['suggest-reword placed " "', stormBoard(), 'words_required'],
    [
      `suggest-reword placed "${'w'.repeat(NOTE_CHANGE_WORDS_MAX + 1)}"`,
      stormBoard(),
      'invalid_value',
    ],
    [
      `suggest-reword placed "Order X" term=Order to="${'t'.repeat(TERM_MAX + 1)}"`,
      stormBoard(),
      'invalid_value',
    ],
    ['suggest-reword placed "Booking Placed" term=" " to=Booking', stormBoard(), 'invalid_value'],
    ['suggest-kind placed sticky', stormBoard(), 'invalid_kind'],
    ['suggest-kind placed domain-event', stormBoard(), 'same_kind'],
    ['suggest-split placed "Only one"', stormBoard(), 'parts_required'],
    ['suggest-split placed', stormBoard(), 'parts_required'],
    [
      `suggest-split placed ${Array.from({ length: SPLIT_PARTS_MAX + 1 }, (_, i) => `"P${i}"`).join(' ')}`,
      stormBoard(),
      'parts_required',
    ],
    ['suggest-split placed "One" " "', stormBoard(), 'words_required'],
    [
      `suggest-split placed "One" "${'w'.repeat(NOTE_CHANGE_WORDS_MAX + 1)}"`,
      stormBoard(),
      'invalid_value',
    ],
    [`suggest-remove placed reason="${'r'.repeat(201)}"`, stormBoard(), 'reason_too_long'],
    ['suggest-remove nowhere', stormBoard(), 'target_not_found'],
    ['suggest-remove box', stormBoard(), 'note_not_a_note'],
    ['suggest-remove ordering', stormBoard(), 'note_not_a_note'],
    ['suggest-reword placed "Order  Placed"', stormBoard(), 'duplicate_suggestion'],
    [
      'suggest-reword placed "Booking Placed" term=Meal to=Booking',
      stormBoard(),
      'term_not_in_words',
    ],
    [
      'suggest-reword placed "Sale Placed" term=Order to=Booking',
      stormBoard(),
      'term_not_in_words',
    ],
  ])('refuses %s', (line, tab, code) => {
    expect(refused(run(line, tab)).code).toBe(code);
  });

  it('gives a blank note its first words', () => {
    const blank = stormBoard((el) => (el.id === 'placed' ? { ...el, label: undefined } : el));
    const outcome = applied(run('suggest-reword placed "Order Placed"', blank));
    expect(changesOn(outcome.tab, 'placed')).toEqual([{ change: 'reword', words: 'Order Placed' }]);
  });

  it('takes a reword that only changes the casing', () => {
    const outcome = applied(run('suggest-reword placed "ORDER PLACED"', stormBoard()));
    expect(changesOn(outcome.tab, 'placed')).toEqual([{ change: 'reword', words: 'ORDER PLACED' }]);
  });

  it('refuses a change on a suggestion, and says why', () => {
    const suggested = applied(
      run('suggest command "Place Order" before=placed id=place', stormBoard()),
    );
    const rejection = refused(run('suggest-reword place "Submit Order"', suggested.tab));
    expect(rejection.code).toBe('note_not_a_note');
    expect(rejection.hint).toContain('a suggestion is not a note yet');
    expect(refused(run('suggest-remove box', suggested.tab)).hint).toBeUndefined();
  });

  it('refuses the same change twice on one note, ignoring case and punctuation', () => {
    const once = applied(
      run('suggest-reword placed "Booking Placed"\nsuggest-remove placed', stormBoard()),
    );
    expect(refused(run('suggest-reword placed "booking placed."', once.tab)).code).toBe(
      'duplicate_suggestion',
    );
    expect(refused(run('suggest-remove placed', once.tab)).code).toBe('duplicate_suggestion');
    // The same words on another note are another suggestion.
    expect(changesOn(applied(run('suggest-remove paid', once.tab)).tab, 'paid')).toHaveLength(1);
  });

  it('refuses a note that holds as many changes as it may', () => {
    const many = Array.from(
      { length: NOTE_CHANGES_MAX },
      (_, i) => `suggest-reword placed "Order Placed ${i}"`,
    );
    const full = applied(run(many.join('\n'), stormBoard()));
    const rejection = refused(run('suggest-remove placed', full.tab));
    expect(rejection.code).toBe('too_many_suggestions');
    expect(rejection.details[0]).toContain(`placed holds ${NOTE_CHANGES_MAX} suggested changes`);
  });

  it('refuses past the board limit, a change counting as any suggestion does', () => {
    const notes = Array.from({ length: 59 }, (_, i) => `suggest command "c${i}" before=paid`);
    // 59 suggested notes and the suggested context Delivery: the board is full.
    const full = applied(run(notes.join('\n'), stormBoard()));
    expect(refused(run('suggest-remove placed', full.tab)).code).toBe('too_many_suggestions');
  });

  it('refuses a change a person dismissed before on that note', () => {
    const declined: Tab = {
      ...stormBoard(),
      esDeclined: [
        { type: 'reword', words: 'Booking Placed', about: ['placed'] },
        { type: 'kind', kind: 'command', about: ['placed'] },
        { type: 'split', words: 'Order Placed | Order Paid', about: ['placed'] },
        { type: 'remove', about: ['placed'] },
      ],
    };
    for (const line of [
      'suggest-reword placed "booking placed" term=Order to=Booking',
      'suggest-kind placed command',
      'suggest-split placed "Order placed" "Order paid"',
      'suggest-remove placed',
    ])
      expect(refused(run(line, declined)).code).toBe('declined_before');
    // Another kind, another split and another note were never declined.
    expect(
      changesOn(
        applied(
          run(
            'suggest-kind placed policy\nsuggest-split placed "Order" "Placed Order Paid"\nsuggest-remove paid',
            declined,
          ),
        ).tab,
        'placed',
      ),
    ).toHaveLength(2);
  });

  it('refuses a locked note', () => {
    const locked = stormBoard((el) => (el.id === 'placed' ? { ...el, locked: true } : el));
    expect(refused(run('suggest-remove placed', locked)).code).toBe('element_locked');
  });
});

describe('rm … suggested: taking a suggested change back', () => {
  const suggested = () =>
    applied(
      run(
        [
          'suggest-reword placed "Booking Placed"',
          'suggest-remove placed',
          'suggest-name "Shop" ordering kitchen',
          'suggest-name "Orders" ordering',
          'suggest-name "Prep" kitchen',
        ].join('\n'),
        stormBoard(),
      ),
    ).tab;

  it('reads the flag in both forms and prints it back', () => {
    expect(parseEditOperations('rm placed suggested')).toEqual({
      operations: [{ op: 'rm', target: 'placed', suggested: true }],
    });
    expect(formatOperation({ op: 'rm', target: 'placed', suggested: true })).toBe(
      'rm placed suggested',
    );
  });

  it('drops a note’s changes and keeps the note', () => {
    const outcome = applied(run('rm placed suggested', suggested()));
    expect(lines(outcome)).toEqual(['~ placed  took back 2 changes']);
    expect(inBoard(outcome.tab, 'placed')).toMatchObject({ label: 'Order Placed' });
    expect(inBoard(outcome.tab, 'placed')).not.toHaveProperty('esChanges');
  });

  it('drops the names a context holds, for itself and for a merge, and keeps the context', () => {
    const outcome = applied(run('rm ordering suggested', suggested()));
    expect(lines(outcome)).toEqual(['~ ordering  took back 2 names']);
    expect(lines(run('rm kitchen suggested', suggested()))).toEqual([
      '~ kitchen  took back 1 name',
    ]);
    expect(inBoard(outcome.tab, 'ordering')).toMatchObject({
      esContext: { notes: ['placed', 'paid'] },
    });
    expect(inBoard(outcome.tab, 'ordering')).not.toHaveProperty('esContext.names');
    expect(inBoard(outcome.tab, 'kitchen')).toHaveProperty('esContext.names');
  });

  it('with all, passes over the targets that hold nothing', () => {
    const outcome = applied(run('rm type:sticky all suggested', suggested()));
    expect(inBoard(outcome.tab, 'placed')).not.toHaveProperty('esChanges');
    expect(outcome.tab.elements).toHaveLength(suggested().elements.length);
  });

  it('refuses a target that holds nothing suggested', () => {
    const rejection = refused(run('rm paid suggested', suggested()));
    expect(rejection.code).toBe('nothing_suggested');
    expect(rejection.details[0]).toBe('nothing is suggested on paid');
    expect(refused(run('rm delivery suggested', suggested())).code).toBe('nothing_suggested');
    expect(refused(run('rm box suggested', suggested())).code).toBe('nothing_suggested');
  });

  it('refuses a locked target', () => {
    const locked: Tab = {
      ...suggested(),
      elements: suggested().elements.map((el) =>
        el.id === 'placed' ? { ...el, locked: true } : el,
      ),
    };
    expect(refused(run('rm placed suggested', locked)).code).toBe('element_locked');
  });
});
