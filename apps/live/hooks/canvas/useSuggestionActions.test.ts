// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Element, StickyElement, Tab } from '@livedoc/document';
import { useSuggestionActions } from './useSuggestionActions';

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
  let board = elements;
  const commit = vi.fn((mapper: (els: Element[]) => Element[]) => {
    board = mapper(board);
  });
  const select = vi.fn();
  const acts = renderHook(() =>
    useSuggestionActions({
      activeTab: { id: 't', elements } as Tab,
      createBlocked,
      layerInertIds: new Set(),
      commit,
      select,
    }),
  ).result.current;
  return { acts, commit, select, board: () => board };
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
    const { acts, commit } = setup([note('e', 1000), suggestion('p', 'e', 'after')], true);
    acts.apply('p');
    acts.applyAll();
    acts.dismiss('p');
    acts.dismissAll();
    expect(commit).not.toHaveBeenCalled();
    expect(track).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith('[suggestions] refused', { reason: 'blocked' });
  });

  it('refuses to apply what is no open suggestion', () => {
    const { acts, commit } = setup([note('e', 1000)]);
    acts.apply('e');
    acts.applyAll();
    acts.dismissAll();
    expect(commit).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith('[suggestions] refused', { reason: 'not-a-suggestion' });
  });
});
