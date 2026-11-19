// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Tab } from '@livedoc/document';
import type { StormGap } from '@livedoc/storm-reading';
import type { ReviewActions } from './useReviewActions';
import { REVIEW_BOARD_IDS as IDS, reviewBoardElements } from '@/lib/review-board.fixture';
import { resetReviewViewForTests, reviewViewFor } from '@/lib/review-view';
import { resetStructureViewForTests, structureViewFor } from '@/lib/structure-view';
import {
  changeKey,
  endSuggestionPreview,
  parsePreviewKey,
  previewSuggestion,
  suggestionViewFor,
} from '@/lib/suggestion-view';
import { toggleReview } from '@/lib/review-open';
import { useReviewPanel } from './useReviewPanel';

// The Review panel's working parts (docs/specs/021-event-storming/board-review.md).

const track = vi.fn<typeof import('@/lib/telemetry').track>();
vi.mock('@/lib/telemetry', () => ({ track: (...a: Parameters<typeof track>) => track(...a) }));
const debugLog = vi.fn<(...a: unknown[]) => void>();
vi.mock('@/lib/debug-log', () => ({ debugLog: (...a: unknown[]) => debugLog(...a) }));

const tab = {
  id: 't',
  name: 'Kitchen',
  kind: 'event-storming',
  elements: reviewBoardElements(),
} as Tab;

function setup() {
  const acts = {
    addForGap: vi.fn<ReviewActions['addForGap']>(),
    renameTerm: vi.fn<ReviewActions['renameTerm']>(),
  };
  const reveal = vi.fn<(rect: { x: number; y: number; width: number; height: number }) => void>();
  const hook = renderHook(() => useReviewPanel({ tab, acts, inertIds: new Set(), reveal }));
  return { hook, acts, reveal, now: () => hook.result.current };
}

beforeEach(() => {
  track.mockClear();
  debugLog.mockClear();
});
afterEach(() => {
  resetReviewViewForTests();
  resetStructureViewForTests();
  endSuggestionPreview('t');
});

describe('useReviewPanel', () => {
  it('reads the board only while the panel is open', () => {
    const { now } = setup();
    expect(now().reading).toBeNull();
    act(() => toggleReview('t'));
    expect(now().reading!.timeline).toHaveLength(5);
  });

  it('rings notes and brings them into view; letting go moves nothing', () => {
    const { now, reveal } = setup();
    act(() => toggleReview('t'));
    act(() => now().panelActs.ring([IDS.takeOrder, IDS.orderTaken], true));
    expect(reviewViewFor('t')).toMatchObject({
      ringed: [IDS.takeOrder, IDS.orderTaken],
      dim: true,
    });
    const rect = reveal.mock.calls[0]![0];
    expect(rect.x).toBe(0);
    expect(rect.height).toBeGreaterThan(200);
    act(() => now().panelActs.ring([]));
    expect(reveal).toHaveBeenCalledTimes(1);
    expect(reviewViewFor('t').ringed).toEqual([]);
  });

  it('opens a hotspot’s answer and brings the hotspot into view', () => {
    const { now, reveal } = setup();
    act(() => now().panelActs.answer(IDS.sentBack));
    expect(structureViewFor('t').answeringId).toBe(IDS.sentBack);
    expect(reveal).toHaveBeenCalledTimes(1);
  });

  it('previews a renamed term through the offered channel, and ends only its own preview', () => {
    const { now } = setup();
    const ask = { from: 'order', to: 'ticket', scope: { type: 'board' as const } };
    act(() => now().panelActs.previewRename(ask));
    expect(parsePreviewKey(suggestionViewFor('t').previewKey)).toMatchObject({
      type: 'term',
      to: 'ticket',
    });
    act(() => now().panelActs.previewRename(null));
    expect(suggestionViewFor('t').previewKey).toBeNull();
    act(() => previewSuggestion('t', changeKey('n1')));
    act(() => now().panelActs.previewRename(null));
    expect(suggestionViewFor('t').previewKey).toBe(changeKey('n1'));
  });

  it('says whether a rename would change anything, and hands the rename and Add to the acts', () => {
    const { now, acts } = setup();
    const scope = { type: 'board' as const };
    expect(now().panelActs.renameWouldChange({ from: 'order', to: 'ticket', scope })).toBe(true);
    expect(now().panelActs.renameWouldChange({ from: 'order', to: 'order', scope })).toBe(false);
    now().panelActs.rename({ from: 'order', to: 'ticket', scope });
    expect(acts.renameTerm).toHaveBeenCalledWith('order', 'ticket', scope);
    const gap = { code: 'event_without_cause', ids: [IDS.tableCleared] } as StormGap;
    now().panelActs.add(gap);
    expect(acts.addForGap).toHaveBeenCalledWith(gap);
  });

  it('counts a walk of the story once per opening of the Story tab', () => {
    const { now } = setup();
    act(() => toggleReview('t'));
    act(() => now().setTab('story'));
    track.mockClear();
    act(() => now().panelActs.storyWalked());
    act(() => now().panelActs.storyWalked());
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith('Canvas', 'Used', 'StoryWalked');
    act(() => now().setTab('check'));
    act(() => now().setTab('story'));
    act(() => now().panelActs.storyWalked());
    expect(track).toHaveBeenCalledTimes(2);
  });

  it('closes the panel when its board is left', () => {
    const { hook } = setup();
    act(() => toggleReview('t'));
    hook.unmount();
    expect(reviewViewFor('t').open).toBe(false);
  });
});
