// Name suggestions (docs/specs/021-event-storming/suggested-changes.md "Name suggestions").
import { describe, expect, it } from 'vitest';
import {
  CONTEXT_NAME_MAX,
  CONTEXT_NAMES_MAX,
  NAMED_CONTEXTS_MAX,
  applyContextSuggestions,
  isValidEsContext,
  leaveContext,
  mergeContexts,
  mergeKeeperOf,
  pruneNameSuggestions,
  removeContexts,
  type CandidateContextElement,
  type EsNameSuggestion,
} from './candidate-contexts';
import {
  addNameSuggestion,
  chooseNameSuggestion,
  dismissNameSuggestions,
  nameSuggestionsFor,
  openNameSuggestions,
  withoutNameSuggestions,
} from './context-names';
import type { Element } from './index';

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

const context = (
  id: string,
  notes: string[],
  extra: { names?: EsNameSuggestion[]; label?: string; suggested?: boolean } = {},
): CandidateContextElement => ({
  id,
  type: 'shape',
  shape: 'square',
  x: 0,
  y: 0,
  width: 1,
  height: 1,
  label: extra.label ?? id,
  esContext: {
    notes,
    ...(extra.suggested ? { suggestion: {} } : {}),
    ...(extra.names ? { names: extra.names } : {}),
  },
});

// Ordering holds two notes, Kitchen one to its right, Billing one further right.
const board = (
  names: Partial<Record<'ordering' | 'kitchen' | 'billing', EsNameSuggestion[]>> = {},
) =>
  [
    note('a', 0),
    note('b', 300),
    note('c', 600),
    note('d', 900),
    context('ordering', ['a', 'b'], { label: 'Ordering', names: names.ordering }),
    context('kitchen', ['c'], { label: 'Kitchen', names: names.kitchen }),
    context('billing', ['d'], { label: 'Billing', names: names.billing }),
  ] as Element[];

const ctx = (els: Element[], id: string) =>
  els.find((el) => el.id === id) as CandidateContextElement | undefined;
const namesOn = (els: Element[], id: string) => ctx(els, id)?.esContext.names;

describe('a context that holds name suggestions is valid', () => {
  const valid = (names: unknown) => isValidEsContext({ notes: ['a'], names });

  it('takes names with a reason, who suggested it and the contexts of a merge', () => {
    expect(valid([{ name: 'Sales' }])).toBe(true);
    expect(valid([{ name: 'Sales', with: ['kitchen'], reason: 'one team', by: 'Ada' }])).toBe(true);
    expect(valid([])).toBe(true);
  });

  it('refuses a blank or long name, an empty or crowded merge, and more than it may hold', () => {
    expect(valid('Sales')).toBe(false);
    expect(valid([null])).toBe(false);
    expect(valid([{ name: ' ' }])).toBe(false);
    expect(valid([{ name: 'x'.repeat(CONTEXT_NAME_MAX + 1) }])).toBe(false);
    expect(valid([{ name: 'Sales', with: [] }])).toBe(false);
    expect(valid([{ name: 'Sales', with: 'kitchen' }])).toBe(false);
    expect(valid([{ name: 'Sales', with: [''] }])).toBe(false);
    expect(
      valid([
        { name: 'Sales', with: Array.from({ length: NAMED_CONTEXTS_MAX }, (_, i) => `c${i}`) },
      ]),
    ).toBe(false);
    expect(valid([{ name: 'Sales', reason: 7 }])).toBe(false);
    expect(valid([{ name: 'Sales', by: 7 }])).toBe(false);
    expect(valid(Array.from({ length: CONTEXT_NAMES_MAX + 1 }, () => ({ name: 'Sales' })))).toBe(
      false,
    );
  });
});

describe('mergeKeeperOf', () => {
  it('is the context with the most notes', () => {
    expect(mergeKeeperOf(board(), ['kitchen', 'ordering'])?.id).toBe('ordering');
  });

  it('is the leftmost on a tie', () => {
    expect(mergeKeeperOf(board(), ['billing', 'kitchen'])?.id).toBe('kitchen');
  });

  it('is none for fewer than two contexts', () => {
    expect(mergeKeeperOf(board(), ['ordering'])).toBeNull();
    expect(mergeKeeperOf(board(), ['ordering', 'a', 'nope'])).toBeNull();
  });
});

describe('addNameSuggestion', () => {
  it('puts a name for one context on that context', () => {
    const out = addNameSuggestion(board(), ['kitchen'], { name: '  Meal   Prep ', by: 'Ada' });
    expect(namesOn(out, 'kitchen')).toEqual([{ name: 'Meal Prep', by: 'Ada' }]);
  });

  it('puts a name for a merge on the context the merge keeps, naming the others', () => {
    const out = addNameSuggestion(board(), ['kitchen', 'ordering', 'kitchen'], {
      name: 'Sales',
      reason: 'one team runs both',
    });
    expect(namesOn(out, 'ordering')).toEqual([
      { name: 'Sales', with: ['kitchen'], reason: 'one team runs both' },
    ]);
    expect(namesOn(out, 'kitchen')).toBeUndefined();
  });

  it('appends after the names already held', () => {
    const held = board({ kitchen: [{ name: 'Cooking' }] });
    expect(namesOn(addNameSuggestion(held, ['kitchen'], { name: 'Prep' }), 'kitchen')).toEqual([
      { name: 'Cooking' },
      { name: 'Prep' },
    ]);
  });

  it('changes nothing for a blank name, a context that is not there, or a full context', () => {
    const els = board();
    expect(addNameSuggestion(els, ['kitchen'], { name: '  ' })).toBe(els);
    expect(addNameSuggestion(els, ['nope'], { name: 'Sales' })).toBe(els);
    expect(addNameSuggestion(els, ['kitchen', 'a'], { name: 'Sales' })).toBe(els);
    expect(addNameSuggestion(els, [], { name: 'Sales' })).toBe(els);
    const full = board({
      kitchen: Array.from({ length: CONTEXT_NAMES_MAX }, (_, i) => ({ name: `Name ${i}` })),
    });
    expect(addNameSuggestion(full, ['kitchen'], { name: 'Sales' })).toBe(full);
  });

  it('cuts a name to the longest a context carries', () => {
    const out = addNameSuggestion(board(), ['kitchen'], { name: 'x'.repeat(CONTEXT_NAME_MAX + 9) });
    expect(namesOn(out, 'kitchen')![0]!.name).toHaveLength(CONTEXT_NAME_MAX);
  });
});

describe('nameSuggestionsFor', () => {
  const els = board({
    ordering: [{ name: 'Orders' }, { name: 'Sales', with: ['kitchen'] }],
    kitchen: [{ name: 'Cooking' }, { name: 'Shop', with: ['ordering'] }],
  });

  it('lists the names a single context holds for itself', () => {
    expect(nameSuggestionsFor(els, ['ordering'])).toEqual([{ name: 'Orders' }]);
    expect(nameSuggestionsFor(els, ['billing'])).toEqual([]);
  });

  it('lists the names made for exactly the contexts selected, whoever holds them', () => {
    expect(nameSuggestionsFor(els, ['kitchen', 'ordering']).map((s) => s.name)).toEqual([
      'Sales',
      'Shop',
    ]);
    expect(nameSuggestionsFor(els, ['kitchen', 'ordering', 'billing'])).toEqual([]);
    expect(nameSuggestionsFor(els, ['kitchen', 'billing'])).toEqual([]);
  });
});

describe('chooseNameSuggestion', () => {
  it('renames the context and drops its other names for itself, keeping a merge name', () => {
    const els = board({
      kitchen: [{ name: 'Cooking' }, { name: 'Prep' }, { name: 'Shop', with: ['billing'] }],
    });
    const out = chooseNameSuggestion(els, ['kitchen'], 'cooking');
    expect(out.keptId).toBe('kitchen');
    expect(ctx(out.elements, 'kitchen')!.label).toBe('Cooking');
    expect(namesOn(out.elements, 'kitchen')).toEqual([{ name: 'Shop', with: ['billing'] }]);
  });

  it('keeps a suggested context suggested under its new name', () => {
    const els = [
      note('a', 0),
      context('x', ['a'], { suggested: true, names: [{ name: 'Sales' }] }),
    ] as Element[];
    const out = chooseNameSuggestion(els, ['x'], 'Sales').elements;
    expect(ctx(out, 'x')!.label).toBe('Sales');
    expect(ctx(out, 'x')!.esContext).toEqual({ notes: ['a'], suggestion: {} });
  });

  it('merges the contexts and names what is kept, in one write', () => {
    const els = board({
      ordering: [{ name: 'Orders' }, { name: 'Sales', with: ['kitchen'] }],
      kitchen: [{ name: 'Cooking' }],
    });
    const out = chooseNameSuggestion(els, ['ordering', 'kitchen'], 'Sales');
    expect(out.keptId).toBe('ordering');
    expect(ctx(out.elements, 'kitchen')).toBeUndefined();
    expect(ctx(out.elements, 'ordering')!.label).toBe('Sales');
    expect(ctx(out.elements, 'ordering')!.esContext).toEqual({ notes: ['a', 'b', 'c'] });
  });

  it('drops the names for itself even when the name is the one it has', () => {
    const els = board({ kitchen: [{ name: 'Kitchen' }, { name: 'Prep' }] });
    const out = chooseNameSuggestion(els, ['kitchen'], 'Kitchen');
    expect(ctx(out.elements, 'kitchen')!.esContext).toEqual({ notes: ['c'] });
  });

  it('changes nothing for a name that was not suggested for those contexts', () => {
    const els = board({ kitchen: [{ name: 'Cooking' }] });
    expect(chooseNameSuggestion(els, ['kitchen'], 'Prep')).toEqual({ elements: els, keptId: null });
    expect(chooseNameSuggestion(els, ['kitchen', 'billing'], 'Cooking')).toEqual({
      elements: els,
      keptId: null,
    });
  });
});

describe('dismissNameSuggestions', () => {
  const els = () =>
    board({
      ordering: [{ name: 'Orders' }, { name: 'Intake' }, { name: 'Sales', with: ['kitchen'] }],
    });

  it('drops every name shown for a context, leaving the names for a merge', () => {
    expect(namesOn(dismissNameSuggestions(els(), ['ordering']), 'ordering')).toEqual([
      { name: 'Sales', with: ['kitchen'] },
    ]);
  });

  it('drops only the names given, ignoring case', () => {
    expect(
      namesOn(dismissNameSuggestions(els(), ['ordering'], ['INTAKE']), 'ordering')!.map(
        (s) => s.name,
      ),
    ).toEqual(['Orders', 'Sales']);
  });

  it('drops the names for a merge and leaves the rest', () => {
    expect(
      namesOn(dismissNameSuggestions(els(), ['kitchen', 'ordering']), 'ordering')!.map(
        (s) => s.name,
      ),
    ).toEqual(['Orders', 'Intake']);
  });

  it('answers the same board when nothing is dismissed', () => {
    const same = els();
    expect(dismissNameSuggestions(same, ['billing'])).toBe(same);
    expect(dismissNameSuggestions(same, ['ordering'], ['Nope'])).toBe(same);
  });

  it('leaves no empty list behind', () => {
    const one = board({ kitchen: [{ name: 'Cooking' }] });
    expect(ctx(dismissNameSuggestions(one, ['kitchen']), 'kitchen')!.esContext).toEqual({
      notes: ['c'],
    });
  });
});

describe('withoutNameSuggestions', () => {
  it('drops every name a context holds, for itself and for a merge', () => {
    const els = board({ ordering: [{ name: 'Orders' }, { name: 'Sales', with: ['kitchen'] }] });
    expect(ctx(withoutNameSuggestions(els, 'ordering'), 'ordering')!.esContext).toEqual({
      notes: ['a', 'b'],
    });
  });

  it('answers the same board for a context that holds none, or is not one', () => {
    const els = board();
    expect(withoutNameSuggestions(els, 'ordering')).toBe(els);
    expect(withoutNameSuggestions(els, 'a')).toBe(els);
  });
});

describe('a name goes with its contexts', () => {
  const els = () =>
    board({
      ordering: [{ name: 'Orders' }, { name: 'Sales', with: ['kitchen'] }],
      billing: [{ name: 'Money', with: ['kitchen', 'ordering'] }],
    });

  it('removing a context removes the names that name it, and the ones it holds', () => {
    const out = removeContexts(els(), ['kitchen']);
    expect(namesOn(out, 'ordering')).toEqual([{ name: 'Orders' }]);
    expect(ctx(out, 'billing')!.esContext).toEqual({ notes: ['d'] });
  });

  it('a context emptied by its last note leaving takes them too', () => {
    const out = leaveContext(els(), ['c']);
    expect(ctx(out, 'kitchen')).toBeUndefined();
    expect(namesOn(out, 'ordering')).toEqual([{ name: 'Orders' }]);
  });

  it('a merge keeps the kept context its names for itself', () => {
    const out = mergeContexts(els(), ['ordering', 'kitchen']).elements;
    expect(namesOn(out, 'ordering')).toEqual([{ name: 'Orders' }]);
    expect(ctx(out, 'billing')!.esContext).toEqual({ notes: ['d'] });
  });

  it('a suggested context applied with none of its notes left takes them too', () => {
    const gone = [
      note('a', 0),
      context('x', ['a'], { names: [{ name: 'Sales', with: ['ghost'] }] }),
      context('ghost', ['zz'], { suggested: true }),
    ] as Element[];
    const out = applyContextSuggestions(gone, ['ghost']);
    expect(ctx(out, 'x')!.esContext).toEqual({ notes: ['a'] });
  });

  it('pruning answers the same board when every name still stands', () => {
    const same = els();
    expect(pruneNameSuggestions(same)).toBe(same);
  });
});

describe('openNameSuggestions', () => {
  it('counts the names whose contexts are all on the board', () => {
    const els = board({
      ordering: [{ name: 'Orders' }, { name: 'Sales', with: ['kitchen'] }],
      kitchen: [{ name: 'Lost', with: ['gone'] }],
    });
    expect(openNameSuggestions(els)).toBe(2);
    expect(openNameSuggestions(board())).toBe(0);
  });
});
