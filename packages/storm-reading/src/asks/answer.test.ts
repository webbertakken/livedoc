// docs/specs/021-event-storming/asks.md "The built-in hand": "The route answers what to add", "onto the board as it
// is by then; an element gone meanwhile is passed over."
import { describe, expect, it } from 'vitest';
import {
  SUGGESTIONS_MAX,
  addNameSuggestion,
  addNoteChange,
  newContextElement,
  newLanePlanElement,
  noteChangesOf,
  openLanePlan,
  openSuggestionCount,
  type Element,
  type EsNoteChange,
  type StickyElement,
} from '@livedoc/document';
import { note } from '../testing';
import { addAskAnswer, askAnswerOf } from './answer';

const BY = 'Built-in model';
const stickies = () =>
  [
    note({ id: 'place', kind: 'command', col: 0 }),
    note({ id: 'placed', kind: 'domain-event', col: 1 }),
    note({ id: 'pay', kind: 'command', col: 2 }),
    note({ id: 'paid', kind: 'domain-event', col: 3 }),
  ] as StickyElement[];

function shop(): Element[] {
  const [place, placed, pay, paid] = stickies();
  return [
    place!,
    placed!,
    pay!,
    paid!,
    newContextElement({ id: 'ordering', name: 'Ordering', notes: [place!, placed!] }),
    newContextElement({ id: 'payments', name: 'Payments', notes: [pay!, paid!] }),
  ];
}

const suggested = (id: string, anchorId: string): Element =>
  ({
    ...note({ id, kind: 'policy', col: 9 }),
    esSuggestion: { anchorId, side: 'after', by: BY },
  }) as Element;
const context = (id: string, notes: StickyElement[]): Element =>
  newContextElement({ id, name: 'Checkout', notes, suggestion: { by: BY } });
const plan = (id = 'plan') =>
  newLanePlanElement({
    id,
    plan: {
      lanes: [
        { name: 'Shop', notes: ['place', 'placed'] },
        { name: 'Till', notes: ['pay', 'paid'] },
      ],
      by: BY,
    },
    notes: stickies(),
  });
const REWORD: EsNoteChange = { change: 'reword', words: 'Pay', by: BY };
const REMOVE: EsNoteChange = { change: 'remove', by: BY };

describe('what an ask adds to a board', () => {
  it('is the new elements, the new names by their contexts and the new changes by their note', () => {
    const before = addNoteChange(
      addNameSuggestion(shop(), ['ordering'], { name: 'Sales' }),
      'pay',
      REMOVE,
    );
    let after = [...before, suggested('notify', 'paid'), plan()];
    after = addNameSuggestion(after, ['ordering'], { name: 'Order Taking', reason: 'why', by: BY });
    after = addNameSuggestion(after, ['ordering', 'payments'], { name: 'Checkout', by: BY });
    after = addNoteChange(after, 'pay', REWORD);
    const answer = askAnswerOf(before, after);
    expect(answer.added.map((el) => el.id)).toEqual(['notify', 'plan']);
    expect(answer.names).toEqual([
      { contexts: ['ordering'], name: 'Order Taking', reason: 'why', by: BY },
      { contexts: ['ordering', 'payments'], name: 'Checkout', by: BY },
    ]);
    expect(answer.changes).toEqual([{ note: 'pay', change: REWORD }]);
  });

  it('leaves a name on a context it adds with that context', () => {
    const before = shop();
    const after = addNameSuggestion(
      [...before, context('checkout', stickies().slice(1, 3))],
      ['checkout'],
      {
        name: 'Till',
      },
    );
    const answer = askAnswerOf(before, after);
    expect(answer.added.map((el) => el.id)).toEqual(['checkout']);
    expect(answer.names).toEqual([]);
  });

  it('is nothing when the board is as it was', () => {
    expect(askAnswerOf(shop(), shop())).toEqual({ added: [], names: [], changes: [] });
  });
});

describe('adding an answer to the board as it is by then', () => {
  it('adds suggested notes in their chain, contexts, names, changes and the plan, and counts them', () => {
    const board = shop();
    const answer = {
      added: [
        suggested('notify', 'paid'),
        suggested('then', 'notify'),
        context('checkout', stickies().slice(1, 3)),
        plan(),
      ],
      names: [{ contexts: ['ordering'], name: 'Sales', by: BY }],
      changes: [{ note: 'pay', change: REWORD }],
    };
    const { elements, added } = addAskAnswer(board, answer);
    expect(added).toBe(6);
    expect(elements.map((el) => el.id)).toEqual([
      ...board.map((el) => el.id),
      'notify',
      'then',
      'checkout',
      'plan',
    ]);
    expect(openSuggestionCount(elements)).toBe(6);
    expect(noteChangesOf(elements.find((el) => el.id === 'pay')!)).toEqual([REWORD]);
  });

  it('passes over what the board no longer holds', () => {
    const board = shop().filter((el) => el.id !== 'paid' && el.id !== 'payments');
    const { elements, added } = addAskAnswer(board, {
      added: [
        suggested('notify', 'paid'),
        suggested('then', 'notify'),
        context('gone', [stickies()[3]!]),
        context('half', stickies().slice(2)),
      ],
      names: [{ contexts: ['ordering', 'payments'], name: 'Checkout' }],
      changes: [{ note: 'paid', change: REMOVE }],
    });
    expect(added).toBe(1);
    // A context keeps the notes still there.
    const half = elements.find((el) => el.id === 'half') as { esContext: { notes: string[] } };
    expect(half.esContext.notes).toEqual(['pay']);
    expect(elements).toHaveLength(board.length + 1);
  });

  it('adds nothing twice, nothing that is no suggestion, and replaces an open plan', () => {
    const board = [...shop(), plan('old')];
    const stray = note({ id: 'stray', kind: 'actor', col: 7 });
    const { elements, added } = addAskAnswer(board, {
      added: [stray, suggested('place', 'paid'), plan('new')],
      names: [],
      changes: [],
    });
    expect(added).toBe(1);
    expect(openLanePlan(elements)?.id).toBe('new');
    expect(elements.some((el) => el.id === 'stray' || el.id === 'old')).toBe(false);
  });

  it('counts only what lands: a name or a change the board refuses is none', () => {
    const full = Array.from({ length: 4 }, (_, i): EsNoteChange => ({
      change: 'reword',
      words: `w${i}`,
    }));
    const board = full.reduce((els, change) => addNoteChange(els, 'pay', change), shop());
    const { elements, added } = addAskAnswer(board, {
      added: [],
      names: [{ contexts: ['ordering'], name: '  ' }],
      changes: [{ note: 'pay', change: REMOVE }],
    });
    expect(added).toBe(0);
    expect(elements).toBe(board);
  });

  it('stops at the most suggestions a board holds', () => {
    const board = shop();
    const many = Array.from({ length: SUGGESTIONS_MAX + 5 }, (_, i) => suggested(`s${i}`, 'paid'));
    const { elements, added } = addAskAnswer(board, {
      added: many,
      names: [{ contexts: ['ordering'], name: 'Sales' }],
      changes: [{ note: 'pay', change: REMOVE }],
    });
    expect(added).toBe(SUGGESTIONS_MAX);
    expect(openSuggestionCount(elements)).toBe(SUGGESTIONS_MAX);
  });
});
