import { describe, expect, it } from 'vitest';
import {
  CONTEXT_NAME_MAX,
  CONTEXT_NOTES_MAX,
  applyContextSuggestions,
  candidateContexts,
  contextBounds,
  contextNotes,
  contextOf,
  emptyContextIds,
  isCandidateContext,
  isKeptContext,
  isOpenSuggestion,
  isSuggestedContext,
  isValidEsContext,
  joinContext,
  leaveContext,
  newContextElement,
  removeContexts,
  renameContext,
  type CandidateContextElement,
} from './candidate-contexts';
import { withDependents } from './arrow-rebind';
import { hiddenLayerElementIds, layerBands, visibleLayerElements } from './layers';
import { elementValidationIssue, isValidElement } from './validate';
import type { Element } from './index';

const note = (id: string, x: number, extra: Record<string, unknown> = {}): Element => ({
  id,
  type: 'sticky',
  x,
  y: 0,
  width: 200,
  height: 200,
  label: id,
  esKind: 'domain-event',
  ...extra,
});

const context = (
  id: string,
  notes: string[],
  extra: { suggestion?: { reason?: string; by?: string }; label?: string } = {},
): CandidateContextElement => ({
  id,
  type: 'shape',
  shape: 'square',
  x: 0,
  y: 0,
  width: 1,
  height: 1,
  label: extra.label ?? `Context ${id}`,
  esContext: { notes, ...(extra.suggestion ? { suggestion: extra.suggestion } : {}) },
});

const byId = (els: Element[]) => new Map(els.map((el) => [el.id, el]));
const ctx = (els: Element[], id: string) =>
  els.find((el) => el.id === id) as CandidateContextElement | undefined;

describe('isValidEsContext', () => {
  it('takes notes by id, with an optional suggestion', () => {
    expect(isValidEsContext({ notes: ['a'] })).toBe(true);
    expect(isValidEsContext({ notes: ['a'], suggestion: { reason: 'r', by: 'Ada' } })).toBe(true);
    expect(isValidEsContext({ notes: ['a'], suggestion: {} })).toBe(true);
  });

  it('refuses no notes, too many, blank ids and an overlong reason or by', () => {
    expect(isValidEsContext(null)).toBe(false);
    expect(isValidEsContext({ notes: [] })).toBe(false);
    expect(isValidEsContext({ notes: 'a' })).toBe(false);
    expect(isValidEsContext({ notes: [''] })).toBe(false);
    expect(
      isValidEsContext({ notes: Array.from({ length: CONTEXT_NOTES_MAX + 1 }, (_, i) => `n${i}`) }),
    ).toBe(false);
    expect(isValidEsContext({ notes: ['a'], suggestion: { reason: 'x'.repeat(201) } })).toBe(false);
    expect(isValidEsContext({ notes: ['a'], suggestion: { by: 'x'.repeat(61) } })).toBe(false);
    expect(isValidEsContext({ notes: ['a'], suggestion: 'yes' })).toBe(false);
  });
});

describe('validate (a candidate context element)', () => {
  it('accepts a named context', () => {
    expect(isValidElement(context('c', ['a']))).toBe(true);
  });

  it('names esContext when it is malformed', () => {
    expect(
      elementValidationIssue({ ...context('c', ['a']), esContext: { notes: [] } })?.field,
    ).toBe('esContext');
  });

  it('needs a name of 1 to CONTEXT_NAME_MAX characters', () => {
    expect(elementValidationIssue(context('c', ['a'], { label: '  ' }))?.field).toBe('label');
    expect(
      elementValidationIssue(context('c', ['a'], { label: 'x'.repeat(CONTEXT_NAME_MAX + 1) }))
        ?.field,
    ).toBe('label');
  });
});

describe('the guards', () => {
  const kept = context('k', ['a']);
  const suggested = context('s', ['a'], { suggestion: { reason: 'why' } });

  it('tell a kept context from a suggested one', () => {
    expect(isCandidateContext(kept)).toBe(true);
    expect(isKeptContext(kept)).toBe(true);
    expect(isSuggestedContext(kept)).toBe(false);
    expect(isSuggestedContext(suggested)).toBe(true);
    expect(isKeptContext(suggested)).toBe(false);
    expect(isCandidateContext(note('a', 0))).toBe(false);
  });

  it('count a suggested context and a suggested note as open suggestions', () => {
    expect(isOpenSuggestion(suggested)).toBe(true);
    expect(isOpenSuggestion(note('n', 0, { esSuggestion: { anchorId: 'a', side: 'after' } }))).toBe(
      true,
    );
    expect(isOpenSuggestion(kept)).toBe(false);
    expect(isOpenSuggestion(note('a', 0))).toBe(false);
  });
});

describe('a context is no board content for the painters', () => {
  const els = [note('a', 0), context('c', ['a'])];

  it('is dropped by every layer funnel', () => {
    expect(visibleLayerElements(els, undefined).map((el) => el.id)).toEqual(['a']);
    expect(layerBands(els, undefined)[0]!.elements.map((el) => el.id)).toEqual(['a']);
    expect([...hiddenLayerElementIds(els, undefined)]).toEqual(['c']);
  });
});

describe('reading a context', () => {
  const els = [
    note('a', 0),
    note('b', 300),
    note('plain', 600, { esKind: undefined }),
    context('c', ['a', 'gone', 'b', 'plain']),
    context('s', ['x'], { suggestion: {} }),
  ];

  it('lists the contexts on a board', () => {
    expect(candidateContexts(els).map((c) => c.id)).toEqual(['c', 's']);
  });

  it('reads its notes: the workshop notes that still exist, in order', () => {
    expect(contextNotes(ctx(els, 'c')!, byId(els)).map((n) => n.id)).toEqual(['a', 'b']);
  });

  it('finds the context a note belongs to', () => {
    expect(contextOf(els, 'b')?.id).toBe('c');
    expect(contextOf(els, 'x')?.id).toBe('s');
    expect(contextOf(els, 'plain-missing')).toBeNull();
  });

  it('boxes its notes', () => {
    expect(contextBounds([note('a', 0), note('b', 300)] as never)).toEqual({
      x: 0,
      y: 0,
      width: 500,
      height: 200,
    });
    expect(contextBounds([])).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });
});

describe('newContextElement', () => {
  it('builds a suggested context round its notes, on the first note’s layer', () => {
    const a = note('a', 0, { layerId: 'L2' });
    const el = newContextElement({
      id: 'c',
      name: 'Billing',
      notes: [a, note('b', 300)] as never,
      suggestion: { reason: 'money', by: 'Agent' },
    });
    expect(el).toMatchObject({
      id: 'c',
      type: 'shape',
      label: 'Billing',
      layerId: 'L2',
      x: 0,
      width: 500,
      esContext: { notes: ['a', 'b'], suggestion: { reason: 'money', by: 'Agent' } },
    });
    expect(isValidElement(el)).toBe(true);
  });

  it('builds a kept one without a suggestion', () => {
    const el = newContextElement({ id: 'c', name: 'B', notes: [note('a', 0)] as never });
    expect(el.esContext.suggestion).toBeUndefined();
    expect(el.layerId).toBeUndefined();
  });
});

describe('joinContext', () => {
  it('adds notes to a context, taking them from any other, and drops one left empty', () => {
    const els = [
      note('a', 0),
      note('b', 300),
      note('c', 600),
      context('k1', ['a']),
      context('k2', ['b', 'c']),
      context('s', ['c'], { suggestion: {} }),
    ];
    const out = joinContext(els, 'k1', ['b', 'c']);
    expect(ctx(out, 'k1')!.esContext.notes).toEqual(['a', 'b', 'c']);
    expect(ctx(out, 'k2')).toBeUndefined();
    expect(ctx(out, 's')).toBeUndefined();
    expect(ctx(out, 'k1')!.width).toBe(800);
  });

  it('keeps a context that still has a note', () => {
    const els = [note('a', 0), note('b', 300), context('k1', ['a']), context('k2', ['b', 'a'])];
    expect(ctx(joinContext(els, 'k1', ['a']), 'k2')!.esContext.notes).toEqual(['b']);
  });

  it('ignores what is no workshop note, and changes nothing for an unknown context', () => {
    const els = [note('a', 0), note('p', 300, { esKind: undefined }), context('k', ['a'])];
    expect(joinContext(els, 'k', ['p'])).toBe(els);
    expect(joinContext(els, 'nope', ['a'])).toBe(els);
    expect(joinContext(els, 'k', ['a'])).toBe(els);
  });
});

describe('leaveContext', () => {
  it('takes notes out of their contexts and drops one left empty', () => {
    const els = [note('a', 0), note('b', 300), context('k', ['a', 'b']), context('j', ['b'])];
    const out = leaveContext(els, ['b']);
    expect(ctx(out, 'k')!.esContext.notes).toEqual(['a']);
    expect(ctx(out, 'j')).toBeUndefined();
  });

  it('changes nothing for a note in no context', () => {
    const els = [note('a', 0), context('k', ['a'])];
    expect(leaveContext(els, ['zz'])).toBe(els);
  });
});

describe('renameContext', () => {
  const els = [note('a', 0), context('k', ['a'])];

  it('renames, trimmed and with runs of space as one', () => {
    expect(ctx(renameContext(els, 'k', '  Gym   access '), 'k')!.label).toBe('Gym access');
  });

  it('keeps the old name for an empty one, the same one or an unknown context', () => {
    expect(renameContext(els, 'k', '   ')).toBe(els);
    expect(renameContext(els, 'k', 'Context k')).toBe(els);
    expect(renameContext(els, 'zz', 'New')).toBe(els);
  });

  it('cuts a name past CONTEXT_NAME_MAX', () => {
    expect(ctx(renameContext(els, 'k', 'x'.repeat(80)), 'k')!.label).toHaveLength(CONTEXT_NAME_MAX);
  });
});

describe('removeContexts', () => {
  it('removes contexts and nothing else', () => {
    const els = [note('a', 0), context('k', ['a'])];
    expect(removeContexts(els, ['k', 'a']).map((el) => el.id)).toEqual(['a']);
    expect(removeContexts(els, ['zz'])).toBe(els);
  });
});

describe('applyContextSuggestions', () => {
  it('keeps a suggested context, taking its notes from the contexts they joined since', () => {
    const els = [
      note('a', 0),
      note('b', 300),
      context('s', ['a', 'b'], { suggestion: { reason: 'r' } }),
      context('k', ['b']),
    ];
    const out = applyContextSuggestions(els, ['s']);
    expect(ctx(out, 's')!.esContext).toEqual({ notes: ['a', 'b'] });
    expect(ctx(out, 'k')).toBeUndefined();
  });

  it('applies several in order, the first keeping a note two share', () => {
    const els = [
      note('a', 0),
      context('s1', ['a'], { suggestion: {} }),
      context('s2', ['a'], { suggestion: {} }),
    ];
    const out = applyContextSuggestions(els, ['s1', 's2']);
    expect(ctx(out, 's1')!.esContext.notes).toEqual(['a']);
    expect(ctx(out, 's2')).toBeUndefined();
  });

  it('removes a suggested context none of whose notes is left', () => {
    const els = [note('a', 0), context('s', ['gone'], { suggestion: {} })];
    expect(applyContextSuggestions(els, ['s']).map((el) => el.id)).toEqual(['a']);
  });

  it('passes over what is no suggested context', () => {
    const els = [note('a', 0), context('k', ['a'])];
    expect(applyContextSuggestions(els, ['k', 'a'])).toBe(els);
  });
});

describe('a note leaving takes nothing with it (the cascade)', () => {
  const els = [
    note('a', 0),
    note('b', 300),
    context('k', ['a', 'b']),
    context('j', ['a']),
    context('stale', ['gone']),
  ];

  it('names the contexts left with no note', () => {
    expect(emptyContextIds(els, new Set(['a']))).toEqual(['j', 'stale']);
    expect(emptyContextIds(els, new Set(['a', 'b']))).toEqual(['k', 'j', 'stale']);
  });

  it('removes them with the note, in the same delete', () => {
    expect([...withDependents(els, new Set(['a']))].sort()).toEqual(['a', 'j', 'stale']);
  });

  it('keeps a protected context', () => {
    const isProtected = (el: Element) => el.id === 'j';
    expect([...withDependents(els, new Set(['a']), isProtected)].sort()).toEqual(['a', 'stale']);
  });

  it('leaves a board without contexts alone', () => {
    expect([...withDependents([note('a', 0)], new Set(['a']))]).toEqual(['a']);
  });
});
