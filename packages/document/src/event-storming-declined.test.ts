// What was declined (docs/specs/021-event-storming/asks.md "What was declined").
import { describe, expect, it } from 'vitest';
import type { CandidateContextElement } from './candidate-contexts';
import {
  DECLINED_ABOUT_MAX,
  DECLINED_MAX,
  DECLINED_WORDS_MAX,
  declinedChange,
  declinedContext,
  declinedName,
  declinedNote,
  declinedOf,
  isDeclined,
  withDeclined,
  withoutDeclined,
  type EsDeclined,
} from './event-storming-declined';
import { suggestionRootId } from './event-storming-suggestions';
import type { Element, StickyElement } from './index';

const note = (id: string, extra: Partial<StickyElement> = {}): StickyElement => ({
  id,
  type: 'sticky',
  x: 0,
  y: 0,
  width: 200,
  height: 200,
  label: id,
  esKind: 'domain-event',
  ...extra,
});

const suggestion = (id: string, anchorId: string, label: string): StickyElement =>
  note(id, { label, esKind: 'command', esSuggestion: { anchorId, side: 'before' } });

type BoardTab = { id: string; esDeclined?: EsDeclined[] };
const tabWith = (esDeclined?: EsDeclined[]): BoardTab => ({
  id: 't',
  ...(esDeclined ? { esDeclined } : {}),
});

const entry = (extra: Partial<EsDeclined> = {}): EsDeclined => ({
  type: 'note',
  words: 'Place Order',
  kind: 'command',
  about: ['placed'],
  ...extra,
});

describe('declinedOf', () => {
  it('reads the entries a board keeps', () => {
    expect(declinedOf({ esDeclined: [entry()] })).toEqual([entry()]);
    expect(declinedOf({})).toEqual([]);
  });

  it('reads none from a field that is no list, and leaves out what is no entry', () => {
    expect(declinedOf({ esDeclined: 'no' })).toEqual([]);
    expect(
      declinedOf({
        esDeclined: [
          null,
          { type: 'paint', about: ['a'] },
          { type: 'remove', about: [] },
          { type: 'remove', about: 'a' },
          { type: 'remove', about: [''] },
          { type: 'remove', about: Array.from({ length: DECLINED_ABOUT_MAX + 1 }, () => 'a') },
          { type: 'note', words: 7, about: ['a'] },
          { type: 'note', words: 'x'.repeat(DECLINED_WORDS_MAX + 1), about: ['a'] },
          { type: 'kind', kind: 'sticky', about: ['a'] },
          { type: 'remove', about: ['a'] },
        ],
      }),
    ).toEqual([{ type: 'remove', about: ['a'] }]);
  });

  it('reads no more than a board may keep, the newest', () => {
    const many = Array.from({ length: DECLINED_MAX + 3 }, (_, i) => entry({ about: [`n${i}`] }));
    const read = declinedOf({ esDeclined: many });
    expect(read).toHaveLength(DECLINED_MAX);
    expect(read.at(-1)).toEqual(entry({ about: [`n${DECLINED_MAX + 2}`] }));
  });
});

describe('isDeclined', () => {
  const tab = {
    esDeclined: [entry(), entry({ type: 'name', kind: undefined, about: ['x', 'y'] })],
  };

  it('matches the same type, words, kind and subjects', () => {
    expect(isDeclined(tab, entry())).toBe(true);
  });

  it('ignores case, punctuation and spacing in the words', () => {
    expect(isDeclined(tab, entry({ words: ' place   ORDER! ' }))).toBe(true);
  });

  it('ignores the order of what it is about', () => {
    expect(isDeclined(tab, entry({ type: 'name', kind: undefined, about: ['y', 'x', 'y'] }))).toBe(
      true,
    );
  });

  it('lets through another type, other words, another kind, or other subjects', () => {
    expect(isDeclined(tab, entry({ type: 'reword' }))).toBe(false);
    expect(isDeclined(tab, entry({ words: 'Pay Order' }))).toBe(false);
    expect(isDeclined(tab, entry({ kind: 'policy' }))).toBe(false);
    expect(isDeclined(tab, entry({ about: ['paid'] }))).toBe(false);
    expect(isDeclined(tab, entry({ about: ['placed', 'paid'] }))).toBe(false);
    expect(isDeclined({}, entry())).toBe(false);
  });
});

describe('withDeclined', () => {
  it('remembers what was declined, the newest last', () => {
    const tab = withDeclined(tabWith([entry()]), [entry({ words: 'Pay Order' })]);
    expect(tab.esDeclined).toEqual([entry(), entry({ words: 'Pay Order' })]);
  });

  it('keeps one entry for the same thing declined twice', () => {
    const tab = tabWith([entry()]);
    expect(withDeclined(tab, [entry({ words: 'place order' })])).toBe(tab);
    expect(withDeclined(tab, [])).toBe(tab);
    expect(withDeclined(tabWith(), [entry(), entry({ words: 'PLACE ORDER' })]).esDeclined).toEqual([
      entry(),
    ]);
  });

  it('drops the oldest past the most a board keeps', () => {
    const full = {
      esDeclined: Array.from({ length: DECLINED_MAX }, (_, i) => entry({ about: [`n${i}`] })),
    };
    const next = withDeclined(full, [entry({ about: ['new'] })]).esDeclined;
    expect(next).toHaveLength(DECLINED_MAX);
    expect(next[0]).toEqual(entry({ about: ['n1'] }));
    expect(next.at(-1)).toEqual(entry({ about: ['new'] }));
  });

  it('leaves out what is no entry', () => {
    const tab = tabWith();
    expect(withDeclined(tab, [{ type: 'remove', about: [] }])).toBe(tab);
  });
});

describe('withoutDeclined', () => {
  it('forgets everything', () => {
    expect(withoutDeclined(tabWith([entry()]))).toEqual({ id: 't' });
  });

  it('answers the same tab when there is nothing to forget', () => {
    const tab = tabWith();
    expect(withoutDeclined(tab)).toBe(tab);
  });
});

describe('suggestionRootId', () => {
  const els: Element[] = [
    note('placed'),
    suggestion('s1', 'placed', 'Place Order'),
    suggestion('s2', 's1', 'Open Menu'),
    suggestion('lost', 'gone', 'Lost'),
    suggestion('loop-a', 'loop-b', 'A'),
    suggestion('loop-b', 'loop-a', 'B'),
  ];

  it('is the note a chain of suggestions grows from', () => {
    expect(suggestionRootId(els, 's2')).toBe('placed');
    expect(suggestionRootId(els, 's1')).toBe('placed');
    expect(suggestionRootId(els, 'placed')).toBe('placed');
  });

  it('is the missing anchor for an orphan, and ends on a chain that loops', () => {
    expect(suggestionRootId(els, 'lost')).toBe('gone');
    expect(['loop-a', 'loop-b']).toContain(suggestionRootId(els, 'loop-a'));
  });
});

describe('what an entry says of each suggestion', () => {
  const els: Element[] = [
    note('placed'),
    suggestion('s1', 'placed', 'Place Order'),
    suggestion('s2', 's1', ' Open   Menu '),
  ];

  it('a suggested note is about the note its chain grows from', () => {
    expect(declinedNote(els, els[2] as StickyElement)).toEqual({
      type: 'note',
      words: 'Open Menu',
      kind: 'command',
      about: ['placed'],
    });
  });

  it('a suggested context is about its notes', () => {
    const context: CandidateContextElement = {
      id: 'x',
      type: 'shape',
      shape: 'square',
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      label: 'Kitchen',
      esContext: { notes: ['b', 'a'], suggestion: {} },
    };
    expect(declinedContext(context)).toEqual({
      type: 'context',
      words: 'Kitchen',
      about: ['a', 'b'],
    });
  });

  it('a name is about the contexts it was for', () => {
    expect(declinedName(['y', 'x', 'y'], 'Sales')).toEqual({
      type: 'name',
      words: 'Sales',
      about: ['x', 'y'],
    });
  });

  it('a note change is about its note', () => {
    expect(
      declinedChange('n', {
        change: 'reword',
        words: 'Booking Made',
        term: 'Order',
        to: 'Booking',
      }),
    ).toEqual({ type: 'reword', words: 'Booking Made', about: ['n'] });
    expect(declinedChange('n', { change: 'kind', kind: 'policy' })).toEqual({
      type: 'kind',
      kind: 'policy',
      about: ['n'],
    });
    expect(declinedChange('n', { change: 'split', parts: ['One', 'Two'] })).toEqual({
      type: 'split',
      words: 'One | Two',
      about: ['n'],
    });
    expect(declinedChange('n', { change: 'remove', reason: 'a stray' })).toEqual({
      type: 'remove',
      about: ['n'],
    });
  });

  it('cuts long words and keeps the first of many subjects, in a fixed order', () => {
    expect(declinedName(['x'], 'N'.repeat(DECLINED_WORDS_MAX + 5)).words).toHaveLength(
      DECLINED_WORDS_MAX,
    );
    const many = Array.from(
      { length: DECLINED_ABOUT_MAX + 5 },
      (_, i) => `c${String(i).padStart(3, '0')}`,
    );
    const about = declinedName([...many].reverse(), 'Sales').about;
    expect(about).toHaveLength(DECLINED_ABOUT_MAX);
    expect(about[0]).toBe('c000');
  });
});
