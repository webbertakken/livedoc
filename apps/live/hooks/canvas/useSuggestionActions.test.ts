// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadEveryKindFamily } from '@/lib/element-kinds/load-every-family';
import {
  nameSuggestionsFor,
  noteChangesOf,
  type Element,
  type StickyElement,
  type Tab,
} from '@livedoc/document';
import {
  REMOVE,
  SPLIT,
  byId,
  changed,
  named,
  note as flowNote,
  orderFlow,
} from '@/lib/change-board.fixture';
import { kitchenNotes, plannedKitchen } from '@/lib/lane-board.fixture';
import { isLanePlan } from '@livedoc/document';
import { useSuggestionActions } from './useSuggestionActions';

// The acts are the Event Storming family's, reached through the registry (lib/element-kinds).
beforeAll(loadEveryKindFamily);

// The suggestion acts (docs/specs/021-event-storming/suggestions.md "Applying and dismissing"): each one commit
// through the ordinary choke point, the applied note selected, telemetry once.

const track = vi.fn<typeof import('@/lib/telemetry').track>();
vi.mock('@/lib/telemetry', () => ({ track: (...a: Parameters<typeof track>) => track(...a) }));

const info = vi.spyOn(console, 'info').mockImplementation(() => {});

function note(id: string, x: number): StickyElement {
  return {
    id,
    type: 'sticky',
    esKind: 'domain-event',
    fixedSize: true,
    x,
    y: 480,
    width: 200,
    height: 200,
  };
}

const suggestion = (id: string, anchorId: string, side: 'before' | 'after'): StickyElement => ({
  ...note(id, 0),
  esSuggestion: { anchorId, side },
});

function setup(elements: Element[], createBlocked = false) {
  let tab = { id: 't', elements } as Tab;
  const commit = vi.fn((mapper: (els: Element[]) => Element[]) => {
    tab = { ...tab, elements: mapper(tab.elements) };
  });
  // A dismissal maps the whole tab: the elements and what the board remembers as declined, in one step.
  const commitTab = vi.fn((mapTab: (t: Tab) => Tab) => {
    tab = mapTab(tab);
  });
  const select = vi.fn();
  const acts = renderHook(() =>
    useSuggestionActions({
      activeTab: tab,
      createBlocked,
      layerInertIds: new Set(),
      commit,
      commitTab,
      select,
    }),
  ).result.current;
  return { acts, commit, commitTab, select, board: () => tab.elements, tab: () => tab };
}

beforeEach(() => {
  track.mockClear();
  info.mockClear();
});

describe('useSuggestionActions', () => {
  it('applies one suggestion as one commit, selects the note and counts it', () => {
    const { acts, commit, select, board } = setup([note('e', 1000), suggestion('p', 'e', 'after')]);
    acts.apply('p');
    expect(commit).toHaveBeenCalledTimes(1);
    expect((board()[1] as StickyElement).esSuggestion).toBeUndefined();
    expect(select).toHaveBeenCalledWith('p');
    expect(track.mock.calls).toEqual([
      ['Canvas', 'Used', 'SuggestionApplied'],
      ['Element', 'Added', 'Sticky'],
    ]);
    expect(info).toHaveBeenCalledWith(
      '[suggestions] applied',
      expect.objectContaining({ id: 'p' }),
    );
  });

  it('applies all in one commit and counts each note added', () => {
    const { acts, commit, board } = setup([
      note('e', 1000),
      suggestion('p', 'e', 'after'),
      suggestion('c', 'e', 'before'),
    ]);
    acts.applyAll();
    expect(commit).toHaveBeenCalledTimes(1);
    expect(board().some((el) => (el as StickyElement).esSuggestion)).toBe(false);
    expect(track.mock.calls).toEqual([
      ['Canvas', 'Used', 'SuggestionsAppliedAll'],
      ['Element', 'Added', 'Sticky'],
      ['Element', 'Added', 'Sticky'],
    ]);
  });

  it('dismisses one or all in one commit', () => {
    const one = setup([
      note('e', 1000),
      suggestion('p', 'e', 'after'),
      suggestion('c', 'e', 'before'),
    ]);
    one.acts.dismiss('p');
    expect(one.board().map((el) => el.id)).toEqual(['e', 'c']);
    expect(track).toHaveBeenLastCalledWith('Canvas', 'Used', 'SuggestionDismissed');
    const all = setup([
      note('e', 1000),
      suggestion('p', 'e', 'after'),
      suggestion('c', 'e', 'before'),
    ]);
    all.acts.dismissAll();
    expect(all.board().map((el) => el.id)).toEqual(['e']);
    expect(track).toHaveBeenLastCalledWith('Canvas', 'Used', 'SuggestionsDismissedAll');
  });

  it('refuses every act where the change would be refused', () => {
    const { acts, commit, commitTab } = setup(
      [note('e', 1000), suggestion('p', 'e', 'after')],
      true,
    );
    acts.apply('p');
    acts.applyAll();
    acts.dismiss('p');
    acts.dismissAll();
    expect(commit).not.toHaveBeenCalled();
    expect(commitTab).not.toHaveBeenCalled();
    expect(track).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith('[suggestions] refused', { reason: 'blocked' });
  });

  it('refuses to apply what is no open suggestion', () => {
    const { acts, commit, commitTab } = setup([note('e', 1000)]);
    acts.apply('e');
    acts.applyAll();
    acts.dismissAll();
    expect(commit).not.toHaveBeenCalled();
    expect(commitTab).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith('[suggestions] refused', { reason: 'not-a-suggestion' });
  });
});

// Suggested candidate contexts are suggestions too (docs/specs/021-event-storming/candidate-contexts.md "How a person
// sees and decides").
describe('useSuggestionActions with suggested contexts', () => {
  const context = (id: string, notes: string[], suggested = true): Element => ({
    id,
    type: 'shape',
    shape: 'square',
    x: 0,
    y: 0,
    width: 1,
    height: 1,
    label: id,
    esContext: { notes, ...(suggested ? { suggestion: { reason: 'r' } } : {}) },
  });
  const contextOf = (els: Element[], id: string) =>
    els.find((el) => el.id === id) as
      (Element & { esContext: { suggestion?: unknown } }) | undefined;

  it('applies a suggested context in one commit, keeping it', () => {
    const { acts, commit, select, board } = setup([note('e', 1000), context('c', ['e'])]);
    acts.apply('c');
    expect(commit).toHaveBeenCalledTimes(1);
    expect(contextOf(board(), 'c')!.esContext.suggestion).toBeUndefined();
    expect(select).not.toHaveBeenCalled();
    expect(track.mock.calls).toEqual([['Canvas', 'Used', 'ContextApplied']]);
  });

  it('dismisses a suggested context, its notes staying', () => {
    const { acts, board } = setup([note('e', 1000), context('c', ['e'])]);
    acts.dismiss('c');
    expect(board().map((el) => el.id)).toEqual(['e']);
    expect(track).toHaveBeenLastCalledWith('Canvas', 'Used', 'ContextDismissed');
  });

  it('takes contexts into Apply All and Dismiss All', () => {
    const els = [note('e', 1000), suggestion('p', 'e', 'after'), context('c', ['e'])];
    const applied = setup(els);
    applied.acts.applyAll();
    expect(applied.commit).toHaveBeenCalledTimes(1);
    expect(contextOf(applied.board(), 'c')!.esContext.suggestion).toBeUndefined();
    const onlyContexts = setup([note('e', 1000), context('c', ['e'])]);
    onlyContexts.acts.applyAll();
    expect(onlyContexts.commit).toHaveBeenCalledTimes(1);
    const dismissed = setup(els);
    dismissed.acts.dismissAll();
    expect(dismissed.board().map((el) => el.id)).toEqual(['e']);
  });

  it('refuses to apply a kept context as a suggestion', () => {
    const { acts, commit } = setup([note('e', 1000), context('k', ['e'], false)]);
    acts.apply('k');
    acts.dismiss('k');
    expect(commit).not.toHaveBeenCalled();
  });
});

// A person's dismissal is remembered (docs/specs/021-event-storming/asks.md "What was declined"), in the same step.
describe('useSuggestionActions remembering what was declined', () => {
  it('remembers a dismissed suggestion and those chained on it, about the note the chain grows from', () => {
    const { acts, commit, commitTab, board, tab } = setup([
      { ...note('e', 1000), label: 'Order placed' },
      { ...suggestion('p', 'e', 'after'), label: 'Take payment' },
      { ...suggestion('q', 'p', 'after'), label: 'Payment taken' },
    ]);
    acts.dismiss('p');
    expect(commitTab).toHaveBeenCalledTimes(1);
    expect(commit).not.toHaveBeenCalled();
    expect(board().map((el) => el.id)).toEqual(['e']);
    expect(tab().esDeclined).toEqual([
      { type: 'note', words: 'Take payment', kind: 'domain-event', about: ['e'] },
      { type: 'note', words: 'Payment taken', kind: 'domain-event', about: ['e'] },
    ]);
  });

  it('remembers nothing when a suggestion is applied', () => {
    const { acts, tab } = setup([note('e', 1000), suggestion('p', 'e', 'after')]);
    acts.apply('p');
    acts.applyAll();
    expect(tab().esDeclined).toBeUndefined();
  });
});

// Apply All and Dismiss All include name suggestions and note changes
// (docs/specs/021-event-storming/suggested-changes.md "Accepting").
describe('useSuggestionActions with suggested changes', () => {
  const board = () =>
    changed(named(orderFlow(), ['ordering'], 'Order taking', 'Sales'), 'packed', SPLIT, REMOVE);

  it('Apply All goes on to each context’s first name and each note’s first change, in the one commit', () => {
    const { acts, commit, board: after } = setup(board());
    acts.applyAll();
    expect(commit).toHaveBeenCalledTimes(1);
    expect(byId(after(), 'ordering').label).toBe('Order taking');
    expect(byId(after(), 'packed').label).toBe('Order packed');
    expect(track.mock.calls).toEqual([
      ['Canvas', 'Used', 'SuggestionsAppliedAll'],
      ['Element', 'Added', 'Sticky'],
    ]);
    expect(info).toHaveBeenCalledWith('[suggestions] applied', {
      count: 0,
      contexts: 0,
      names: 1,
      changes: 1,
      plan: 0,
    });
  });

  it('Dismiss All drops every name and note change, and remembers each', () => {
    const { acts, commitTab, board: after, tab } = setup(board());
    acts.dismissAll();
    expect(commitTab).toHaveBeenCalledTimes(1);
    expect(nameSuggestionsFor(after(), ['ordering'])).toEqual([]);
    expect(noteChangesOf(byId(after(), 'packed'))).toEqual([]);
    expect(tab().esDeclined?.map((d) => d.type)).toEqual(['name', 'name', 'split', 'remove']);
    expect(info).toHaveBeenCalledWith('[suggestions] dismissed', {
      count: 0,
      contexts: 0,
      names: 1,
      changes: 2,
      plan: 0,
    });
  });
});

// docs/specs/021-event-storming/lane-plans.md "How a person sees and decides": Apply All and Dismiss All include it.
describe('useSuggestionActions: the lane plan', () => {
  const suggested = () => ({
    ...flowNote('s', 'Dish served', 0),
    esSuggestion: { anchorId: 'dish-plated', side: 'after' as const },
  });
  const yOf = (els: Element[], id: string) => (els.find((el) => el.id === id) as { y: number }).y;

  it('Apply All applies the plan first, then lands the rest on the board it leaves, in one commit', () => {
    const { acts, commit, board } = setup([...plannedKitchen().elements, suggested()]);
    acts.applyAll();
    expect(commit).toHaveBeenCalledTimes(1);
    expect(board().some(isLanePlan)).toBe(false);
    // The suggested event landed beside its anchor, on the lane the plan moved the anchor to.
    expect(yOf(board(), 's')).toBe(yOf(board(), 'dish-plated'));
    expect(yOf(board(), 'dish-plated')).not.toBe(yOf(kitchenNotes(), 'dish-plated'));
    expect(info).toHaveBeenCalledWith(
      '[suggestions] applied',
      expect.objectContaining({ plan: 1 }),
    );
  });

  it('Apply All applies a plan that is the only thing open', () => {
    const { acts, commit, board } = setup(plannedKitchen().elements);
    acts.applyAll();
    expect(commit).toHaveBeenCalledTimes(1);
    expect(board().some(isLanePlan)).toBe(false);
  });

  it('Apply All leaves a stale plan for its row to say so', () => {
    const late = flowNote('late', 'Why?', 5, 'hotspot', 0);
    const alone = setup([...plannedKitchen().elements, late]);
    alone.acts.applyAll();
    expect(alone.commit).not.toHaveBeenCalled();
    const { acts, board } = setup([...plannedKitchen().elements, late, suggested()]);
    acts.applyAll();
    expect(board().some(isLanePlan)).toBe(true);
    expect(info).toHaveBeenCalledWith(
      '[suggestions] applied',
      expect.objectContaining({ plan: 0 }),
    );
  });

  it('Dismiss All removes the plan, stale or not, and remembers nothing of it', () => {
    const { acts, commitTab, tab } = setup(plannedKitchen().elements);
    acts.dismissAll();
    expect(commitTab).toHaveBeenCalledTimes(1);
    expect(tab().elements.some(isLanePlan)).toBe(false);
    expect(tab().esDeclined ?? []).toEqual([]);
    expect(info).toHaveBeenCalledWith(
      '[suggestions] dismissed',
      expect.objectContaining({ plan: 1 }),
    );
  });
});
