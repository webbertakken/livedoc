// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isLanePlan, type Element, type StickyElement, type Tab } from '@livedoc/document';
import { arrangeOffer } from '@/lib/board-offer';
import { note } from '@/lib/change-board.fixture';
import { kitchenNotes, kitchenTab, plannedKitchen } from '@/lib/lane-board.fixture';
import { stopArranging, suggestionViewFor } from '@/lib/suggestion-view';
import { useLaneActions } from './useLaneActions';

// The acts on a lane plan and on Arrange and Reorder (docs/specs/021-event-storming/lane-plans.md "How a person sees
// and decides", docs/specs/021-event-storming/arrange.md "How a person arranges"): each one undoable step, a plan's
// dismissal never remembered, telemetry once.

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
  const notify = vi.fn();
  const acts = renderHook(() =>
    useLaneActions({ activeTab: tab, createBlocked, commit, commitTab, notify, select: vi.fn() }),
  ).result.current;
  return { acts, commit, commitTab, notify, tab: () => tab };
}

const yOf = (tab: Tab, id: string) => (tab.elements.find((el) => el.id === id) as StickyElement).y;
const xOf = (tab: Tab, id: string) => (tab.elements.find((el) => el.id === id) as StickyElement).x;
// The second column stands far further than it needs to.
const loose = () => kitchenNotes().map((el) => (el.id === 'dish-plated' ? { ...el, x: 2000 } : el));
const arranged = () => arrangeOffer(kitchenTab())!.elements;

beforeEach(() => {
  track.mockClear();
  info.mockClear();
});
afterEach(() => stopArranging('t'));

describe('useLaneActions: the lane plan', () => {
  it('applies the plan in one step: the notes moved, the names written, the plan gone', () => {
    const { acts, commitTab, tab } = setup(plannedKitchen().elements);
    acts.applyLanePlan();
    expect(commitTab).toHaveBeenCalledTimes(1);
    expect(tab().elements.some(isLanePlan)).toBe(false);
    expect(yOf(tab(), 'take-order')).toBe(yOf(tab(), 'cook'));
    const names = tab().elements.filter((el) => el.type === 'text');
    expect(names.map((el) => el.label)).toEqual(['Orders', 'Kitchen']);
    expect(track.mock.calls).toEqual([['Canvas', 'Used', 'LanePlanApplied']]);
    expect(info).toHaveBeenCalledWith('[lanes] plan applied', { lanes: 2, notes: 7, gained: 0 });
  });

  it('names the new lane names once, however often the commit maps the tab', () => {
    const { acts, commitTab } = setup(plannedKitchen().elements);
    acts.applyLanePlan();
    const map = commitTab.mock.calls[0]![0];
    const ids = (t: Tab) => t.elements.filter((el) => el.type === 'text').map((el) => el.id);
    expect(ids(map(plannedKitchen()))).toEqual(ids(map(plannedKitchen())));
  });

  it('refuses a stale plan, no plan and a blocked board', () => {
    const stale = setup([...plannedKitchen().elements, note('late', 'Why?', 5, 'hotspot', 0)]);
    stale.acts.applyLanePlan();
    expect(stale.commitTab).not.toHaveBeenCalled();
    expect(info).toHaveBeenLastCalledWith('[lanes] refused', { reason: 'stale' });
    const none = setup(kitchenNotes());
    none.acts.applyLanePlan();
    none.acts.dismissLanePlan();
    expect(info).toHaveBeenLastCalledWith('[lanes] refused', { reason: 'no-plan' });
    const blocked = setup(plannedKitchen().elements, true);
    blocked.acts.applyLanePlan();
    blocked.acts.dismissLanePlan();
    blocked.acts.arrange();
    blocked.acts.keepArranged();
    expect(info).toHaveBeenLastCalledWith('[lanes] refused', { reason: 'blocked' });
    expect(blocked.commit).not.toHaveBeenCalled();
    expect(blocked.commitTab).not.toHaveBeenCalled();
    expect(track).not.toHaveBeenCalled();
  });

  it('dismisses the plan in one step, remembering nothing', () => {
    const { acts, commit, commitTab, tab } = setup(plannedKitchen().elements);
    acts.dismissLanePlan();
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commitTab).not.toHaveBeenCalled();
    expect(tab().elements.some(isLanePlan)).toBe(false);
    expect(tab().esDeclined).toBeUndefined();
    expect(track.mock.calls).toEqual([['Canvas', 'Used', 'LanePlanDismissed']]);
    expect(info).toHaveBeenCalledWith('[lanes] plan dismissed', {});
  });
});

describe('useLaneActions: Arrange and Reorder', () => {
  it('starts the preview and writes nothing', () => {
    const { acts, commit, commitTab, notify } = setup(loose());
    acts.arrange();
    expect(suggestionViewFor('t').arranging).toBe(true);
    expect(commit).not.toHaveBeenCalled();
    expect(commitTab).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith('[lanes] arrange', { outcome: 'preview' });
  });

  it('says so where there is nothing to arrange, and previews nothing', () => {
    const none = setup([note('cook', 'Cook', 0, 'actor', 0)]);
    none.acts.arrange();
    expect(none.notify).toHaveBeenCalledWith(
      'No events yet. Arrange and Reorder follows the timeline.',
    );
    const tidy = setup(arranged());
    tidy.acts.arrange();
    expect(tidy.notify).toHaveBeenCalledWith('Already arranged.');
    expect(suggestionViewFor('t').arranging).toBe(false);
    expect(info).toHaveBeenLastCalledWith('[lanes] arrange', { outcome: 'already' });
  });

  it('keeps the arrangement in one step and ends the preview', () => {
    const { acts, commitTab, tab } = setup(loose());
    acts.arrange();
    acts.keepArranged();
    expect(commitTab).toHaveBeenCalledTimes(1);
    expect(xOf(tab(), 'dish-plated')).toBeLessThan(2000);
    expect(suggestionViewFor('t').arranging).toBe(false);
    expect(track.mock.calls).toEqual([['Canvas', 'Used', 'BoardArranged']]);
    expect(info).toHaveBeenLastCalledWith(
      '[lanes] arranged',
      expect.objectContaining({ notes: 7, gained: 0 }),
    );
  });

  it('keeps nothing where the board is arranged already, and ends the preview', () => {
    const { acts, commitTab } = setup(arranged());
    acts.keepArranged();
    expect(commitTab).not.toHaveBeenCalled();
    expect(info).toHaveBeenLastCalledWith('[lanes] refused', { reason: 'not-arrangeable' });
    expect(track).not.toHaveBeenCalled();
  });
});
