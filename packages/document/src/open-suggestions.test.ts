import { describe, expect, it } from 'vitest';
import { openSuggestionCount } from './open-suggestions';
import type { Element, StickyElement } from './index';

const note = (id: string, extra: Partial<StickyElement> = {}): Element => ({
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

const context = (id: string, esContext: Record<string, unknown>): Element =>
  ({
    id,
    type: 'shape',
    shape: 'square',
    x: 0,
    y: 0,
    width: 1,
    height: 1,
    label: id,
    esContext,
  }) as Element;

describe('openSuggestionCount (suggested-changes.md "Every open suggestion counts")', () => {
  it('counts suggested notes, suggested contexts, name suggestions and note changes alike', () => {
    const els = [
      note('a', { esChanges: [{ change: 'remove' }, { change: 'kind', kind: 'command' }] }),
      note('s', { esSuggestion: { anchorId: 'a', side: 'after' } }),
      context('kept', { notes: ['a'], names: [{ name: 'Sales' }] }),
      context('suggested', { notes: ['a'], suggestion: {} }),
    ];
    expect(openSuggestionCount(els)).toBe(5);
  });

  it('is zero on a board with none', () => {
    expect(openSuggestionCount([note('a'), context('kept', { notes: ['a'] })])).toBe(0);
  });
});
