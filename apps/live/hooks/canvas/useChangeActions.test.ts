// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadEveryKindFamily } from '@/lib/element-kinds/load-every-family';
import {
  candidateContexts,
  nameSuggestionsFor,
  noteChangesOf,
  type Element,
  type Tab,
} from '@livedoc/document';
import { KIND, REWORD, SPLIT, byId, changed, named, orderFlow } from '@/lib/change-board.fixture';
import { useChangeActions } from './useChangeActions';

// The acts are the Event Storming family's, reached through the registry (lib/element-kinds).
beforeAll(loadEveryKindFamily);

// The acts on suggested changes (docs/specs/021-event-storming/suggested-changes.md "How a person sees and decides",
// "Accepting"): each one undoable step, a dismissal remembered in the same step, telemetry once.

const track = vi.fn<typeof import('@/lib/telemetry').track>();
vi.mock('@/lib/telemetry', () => ({ track: (...a: Parameters<typeof track>) => track(...a) }));

const info = vi.spyOn(console, 'info').mockImplementation(() => {});

function setup(elements: Element[], createBlocked = false) {
  let tab = { id: 't', elements } as Tab;
  const commit = vi.fn((mapper: (els: Element[]) => Element[]) => {
    tab = { ...tab, elements: mapper(tab.elements) };
  });
  const commitTab = vi.fn((mapTab: (t: Tab) => Tab) => {
    tab = mapTab(tab);
  });
  const acts = renderHook(() =>
    useChangeActions({
      activeTab: tab,
      createBlocked,
      layerInertIds: new Set(),
      commit,
      commitTab,
    }),
  ).result.current;
  return { acts, commit, commitTab, board: () => tab.elements, tab: () => tab };
}

beforeEach(() => {
  track.mockClear();
  info.mockClear();
});

describe('useChangeActions: names', () => {
  it('renames a context with the name chosen, in one commit, its other names dropped', () => {
    const { acts, commit, board } = setup(
      named(orderFlow(), ['ordering'], 'Order taking', 'Sales'),
    );
    expect(acts.chooseName(['ordering'], 'Sales')).toBe('ordering');
    expect(commit).toHaveBeenCalledTimes(1);
    expect(byId(board(), 'ordering').label).toBe('Sales');
    expect(nameSuggestionsFor(board(), ['ordering'])).toEqual([]);
    expect(track.mock.calls).toEqual([['Canvas', 'Used', 'NameSuggestionApplied']]);
    expect(info).toHaveBeenCalledWith('[changes] name chosen', { contexts: 1, merged: false });
  });

  it('merges several contexts under the name chosen, in one commit', () => {
    const { acts, commit, board } = setup(named(orderFlow(), ['ordering', 'fulfilment'], 'Shop'));
    // Fulfilment holds the most notes, so the merge keeps it.
    expect(acts.chooseName(['ordering', 'fulfilment'], 'Shop')).toBe('fulfilment');
    expect(commit).toHaveBeenCalledTimes(1);
    expect(candidateContexts(board()).map((c) => [c.id, c.label])).toEqual([
      ['fulfilment', 'Shop'],
    ]);
    expect(track.mock.calls).toEqual([
      ['Canvas', 'Used', 'NameSuggestionApplied'],
      ['Canvas', 'Used', 'ContextsMerged'],
    ]);
  });

  it('refuses a name that was not suggested for exactly those contexts', () => {
    const { acts, commit } = setup(named(orderFlow(), ['ordering'], 'Sales'));
    expect(acts.chooseName(['ordering', 'fulfilment'], 'Sales')).toBeNull();
    expect(acts.chooseName(['ordering'], 'Billing')).toBeNull();
    expect(commit).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith('[changes] refused', { reason: 'not-suggested' });
  });

  it('dismisses the names shown and remembers them, in one step', () => {
    const { acts, commit, commitTab, board, tab } = setup(
      named(orderFlow(), ['ordering'], 'Order taking', 'Sales'),
    );
    acts.dismissNames(['ordering']);
    expect(commitTab).toHaveBeenCalledTimes(1);
    expect(commit).not.toHaveBeenCalled();
    expect(nameSuggestionsFor(board(), ['ordering'])).toEqual([]);
    expect(tab().esDeclined).toEqual([
      { type: 'name', words: 'Order taking', about: ['ordering'] },
      { type: 'name', words: 'Sales', about: ['ordering'] },
    ]);
    expect(track.mock.calls).toEqual([['Canvas', 'Used', 'NameSuggestionDismissed']]);
    expect(info).toHaveBeenCalledWith('[changes] names dismissed', { contexts: 1, names: 2 });
  });

  it('dismisses one name alone, the others staying', () => {
    const { acts, board, tab } = setup(named(orderFlow(), ['ordering'], 'Order taking', 'Sales'));
    acts.dismissNames(['ordering'], ['Sales']);
    expect(nameSuggestionsFor(board(), ['ordering']).map((n) => n.name)).toEqual(['Order taking']);
    expect(tab().esDeclined).toEqual([{ type: 'name', words: 'Sales', about: ['ordering'] }]);
  });

  it('refuses to dismiss names where none are suggested', () => {
    const { acts, commitTab } = setup(orderFlow());
    acts.dismissNames(['ordering']);
    expect(commitTab).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith('[changes] refused', { reason: 'not-suggested' });
  });
});

describe('useChangeActions: note changes', () => {
  it('accepts a reword in its context’s scope, in one commit', () => {
    const { acts, commit, board } = setup(changed(orderFlow(), 'pack', REWORD));
    acts.acceptChange('pack', REWORD);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(byId(board(), 'packed').label).toBe('Parcel packed and shipped');
    expect(byId(board(), 'placed').label).toBe('Order placed');
    expect(track.mock.calls).toEqual([['Canvas', 'Used', 'NoteChangeApplied']]);
    expect(info).toHaveBeenCalledWith('[changes] accepted', {
      change: 'reword',
      scope: 'context',
      added: 0,
    });
  });

  it('accepts a reword everywhere when asked', () => {
    const { acts, board } = setup(changed(orderFlow(), 'pack', REWORD));
    acts.acceptChange('pack', REWORD, 'board');
    expect(byId(board(), 'placed').label).toBe('Parcel placed');
  });

  it('accepts a split in one commit, counting each note it adds', () => {
    const { acts, commit, board } = setup(changed(orderFlow(), 'packed', SPLIT));
    acts.acceptChange('packed', SPLIT);
    expect(commit).toHaveBeenCalledTimes(1);
    const labels = board()
      .filter((el) => el.type === 'sticky')
      .map((el) => el.label);
    expect(labels).toContain('Order packed');
    expect(labels).toContain('Order shipped');
    expect(track.mock.calls).toEqual([
      ['Canvas', 'Used', 'NoteChangeApplied'],
      ['Element', 'Added', 'Sticky'],
    ]);
  });

  it('dismisses one change and remembers it, in one step, the note’s others staying', () => {
    const { acts, commit, commitTab, board, tab } = setup(
      changed(orderFlow(), 'pack', REWORD, KIND),
    );
    acts.dismissChange('pack', REWORD);
    expect(commitTab).toHaveBeenCalledTimes(1);
    expect(commit).not.toHaveBeenCalled();
    expect(noteChangesOf(byId(board(), 'pack'))).toEqual([KIND]);
    expect(tab().esDeclined).toEqual([{ type: 'reword', words: 'Pack parcel', about: ['pack'] }]);
    expect(track.mock.calls).toEqual([['Canvas', 'Used', 'NoteChangeDismissed']]);
    expect(info).toHaveBeenCalledWith('[changes] dismissed', { change: 'reword' });
  });

  it('refuses a change the note no longer holds', () => {
    const { acts, commit, commitTab } = setup(orderFlow());
    acts.acceptChange('pack', REWORD);
    acts.dismissChange('pack', REWORD);
    expect(commit).not.toHaveBeenCalled();
    expect(commitTab).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith('[changes] refused', { reason: 'not-suggested' });
  });
});

describe('useChangeActions: where the change would be refused', () => {
  it('refuses every act', () => {
    const board = changed(named(orderFlow(), ['ordering'], 'Sales'), 'pack', REWORD);
    const { acts, commit, commitTab } = setup(board, true);
    expect(acts.chooseName(['ordering'], 'Sales')).toBeNull();
    acts.dismissNames(['ordering']);
    acts.acceptChange('pack', REWORD);
    acts.dismissChange('pack', REWORD);
    expect(commit).not.toHaveBeenCalled();
    expect(commitTab).not.toHaveBeenCalled();
    expect(track).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith('[changes] refused', { reason: 'blocked' });
  });
});
