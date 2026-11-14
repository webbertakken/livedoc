// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Element } from '@livedoc/document';
import { CanvasZoomProvider } from '@/components/canvas/CanvasZoomContext';
import type { SuggestionControls } from '@/components/canvas/Canvas.types';
import { laneActionSpies } from '@/hooks/canvas/lane-actions.fixture';
import { arrangeOffer, lanePlanOffer } from '@/lib/board-offer';
import { note } from '@/lib/change-board.fixture';
import { offeredPreview } from '@/lib/change-preview';
import { kitchenNotes, kitchenTab, plannedKitchen } from '@/lib/lane-board.fixture';
import {
  SUGGESTION_PREVIEW_LEAVE_MS,
  planKey,
  setSuggestionsPanelOpen,
  startArranging,
  stopArranging,
  suggestionViewFor,
} from '@/lib/suggestion-view';
import { BoardOffers } from './BoardOffers';
import { SuggestionLayer } from './SuggestionLayer';
import { STALE_PLAN } from './SuggestionsPanel';

// A whole board rearranged, as a person sees and decides it (docs/specs/021-event-storming/lane-plans.md "How a person
// sees and decides", docs/specs/021-event-storming/arrange.md "How a person arranges").

const TAB = 't';

function controls(): SuggestionControls {
  return {
    ...laneActionSpies(),
    apply: vi.fn(),
    dismiss: vi.fn(),
    applyAll: vi.fn(),
    dismissAll: vi.fn(),
    chooseName: vi.fn(() => null),
    dismissNames: vi.fn(),
    acceptChange: vi.fn(),
    dismissChange: vi.fn(),
    reveal: vi.fn(),
  };
}

afterEach(() => {
  cleanup();
  stopArranging(TAB);
  setSuggestionsPanelOpen(TAB, false);
});

describe('the lane plan in the suggestions panel', () => {
  function panel(elements: Element[], c = controls()) {
    setSuggestionsPanelOpen(TAB, true);
    render(
      <CanvasZoomProvider zoom={1}>
        <SuggestionLayer elements={elements} tabId={TAB} controls={c} showAllSpots={null} />
      </CanvasZoomProvider>,
    );
    return c;
  }

  it('lists the plan with how many lanes, why and who, and applies or dismisses it', () => {
    const c = panel(plannedKitchen({ reason: 'Two parts of the business', by: 'Claude' }).elements);
    const row = screen.getByRole('listitem', { name: 'Lane plan: 2 lanes' });
    expect(row.textContent).toContain('Two parts of the business · Suggested by Claude');
    fireEvent.click(
      within(row).getByRole('button', { name: 'Apply suggestion: Lane plan: 2 lanes' }),
    );
    expect(c.applyLanePlan).toHaveBeenCalledTimes(1);
    fireEvent.click(
      within(row).getByRole('button', { name: 'Dismiss suggestion: Lane plan: 2 lanes' }),
    );
    expect(c.dismissLanePlan).toHaveBeenCalledTimes(1);
  });

  it('previews the plan and brings the board as it would be into view when pointed at', () => {
    const tab = plannedKitchen();
    const c = panel(tab.elements);
    fireEvent.pointerEnter(screen.getByRole('listitem', { name: 'Lane plan: 2 lanes' }));
    expect(suggestionViewFor(TAB).previewKey).toBe(planKey('plan'));
    expect(c.reveal).toHaveBeenCalledWith(lanePlanOffer(tab, 'plan')!.bounds);
  });

  it('says a stale plan is one, and offers Dismiss alone', () => {
    panel([...plannedKitchen().elements, note('late', 'Why?', 5, 'hotspot', 0)]);
    const row = screen.getByRole('listitem', { name: `Lane plan: 2 lanes. ${STALE_PLAN}` });
    expect(row.textContent).toContain(STALE_PLAN);
    expect(within(row).queryByRole('button', { name: /Apply/ })).toBeNull();
    expect(within(row).getByRole('button', { name: /Dismiss/ })).toBeTruthy();
  });

  it('draws only the panel while the plan is previewed: the peek tabs stand down', () => {
    const suggested = {
      ...note('s', 'Dish served', 0),
      esSuggestion: { anchorId: 'dish-plated', side: 'after' as const },
    };
    const elements = [...plannedKitchen().elements, suggested];
    const layer = (offered: ReturnType<typeof offeredPreview>) => (
      <CanvasZoomProvider zoom={1}>
        <SuggestionLayer
          elements={elements}
          tabId={TAB}
          controls={controls()}
          showAllSpots={null}
          offered={offered}
        />
      </CanvasZoomProvider>
    );
    const { container, rerender } = render(layer(null));
    expect(container.querySelector('[data-suggestion-hint]')).not.toBeNull();
    rerender(layer(offeredPreview(elements, planKey('plan'), new Set())));
    expect(container.querySelector('[data-suggestion-hint]')).toBeNull();
    expect(screen.getByRole('complementary', { name: 'Suggestions' })).toBeTruthy();
  });

  it('keeps the focus on the plan’s row while it previews the board, so its keys still decide', () => {
    const elements = plannedKitchen().elements;
    const layer = (offered: ReturnType<typeof offeredPreview>) => (
      <CanvasZoomProvider zoom={1}>
        <SuggestionLayer
          elements={elements}
          tabId={TAB}
          controls={controls()}
          showAllSpots={null}
          offered={offered}
        />
      </CanvasZoomProvider>
    );
    vi.useFakeTimers();
    setSuggestionsPanelOpen(TAB, true);
    const { rerender } = render(layer(null));
    const row = screen.getByRole('listitem', { name: 'Lane plan: 2 lanes' });
    act(() => row.focus());
    expect(suggestionViewFor(TAB).previewKey).toBe(planKey('plan'));
    rerender(layer(offeredPreview(elements, planKey('plan'), new Set())));
    expect(document.activeElement).toBe(row);
    // Leaving the row ends the preview.
    act(() => row.blur());
    act(() => {
      vi.advanceTimersByTime(SUGGESTION_PREVIEW_LEAVE_MS * 2);
    });
    expect(suggestionViewFor(TAB).previewKey).toBeNull();
    vi.useRealTimers();
  });
});

describe('the bar under a board offered', () => {
  const loose = () =>
    kitchenNotes().map((el) => (el.id === 'dish-plated' ? { ...el, x: 2000 } : el));
  function bar(
    elements: Element[],
    extra: Partial<Parameters<typeof BoardOffers>[0]> = {},
    c = controls(),
  ) {
    const view = render(
      <BoardOffers
        tabId={TAB}
        elements={elements}
        offer={null}
        arranging={false}
        dragging={false}
        controls={c}
        {...extra}
      />,
    );
    return { c, ...view };
  }

  it('says a previewed lane plan reads the same, with nothing to press', () => {
    const tab = plannedKitchen();
    bar(tab.elements, { offer: lanePlanOffer(tab, 'plan') });
    expect(screen.getByRole('status').textContent).toBe('2 lanes · Reads the same');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows nothing while nothing is offered', () => {
    bar(kitchenNotes());
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('offers Keep and Put Back while arranging, and fits the view once', () => {
    const elements = loose();
    const offer = arrangeOffer(kitchenTab(elements))!;
    startArranging(TAB);
    const { c, rerender } = bar(elements, { offer, arranging: true });
    expect(screen.getByRole('status').textContent).toBe(
      'Arranged and reordered along the timeline',
    );
    expect(c.reveal).toHaveBeenCalledWith(offer.bounds);
    rerender(
      <BoardOffers
        tabId={TAB}
        elements={[...elements]}
        offer={{ ...offer }}
        arranging
        dragging={false}
        controls={c}
      />,
    );
    expect(c.reveal).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Keep' }));
    expect(c.keepArranged).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Put Back' }));
    expect(suggestionViewFor(TAB).arranging).toBe(false);
  });

  it('puts the board back on Escape, but not while typing, and when a drag takes the board', () => {
    const elements = loose();
    const offer = arrangeOffer(kitchenTab(elements))!;
    startArranging(TAB);
    const { c, rerender } = bar(elements, { offer, arranging: true });
    const field = document.createElement('input');
    document.body.append(field);
    fireEvent.keyDown(field, { key: 'Escape' });
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(suggestionViewFor(TAB).arranging).toBe(true);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(suggestionViewFor(TAB).arranging).toBe(false);
    field.remove();

    act(() => startArranging(TAB));
    rerender(
      <BoardOffers tabId={TAB} elements={elements} offer={offer} arranging dragging controls={c} />,
    );
    expect(suggestionViewFor(TAB).arranging).toBe(false);
  });

  it('says why a board was not arranged, each note a way in, and closes', () => {
    // A locked note where the arranged column would land.
    const elements = [
      ...loose(),
      { ...note('pinned', 'House rule', 0, 'policy', 2), x: 250, locked: true },
    ];
    startArranging(TAB);
    const { c } = bar(elements, { arranging: true });
    const group = screen.getByRole('group', { name: 'Board not arranged' });
    const way = within(group).getAllByRole('button', { name: /^Show on the board: / })[0]!;
    fireEvent.click(way);
    expect(c.selectNote).toHaveBeenCalledTimes(1);
    expect(c.reveal).toHaveBeenCalledTimes(1);
    fireEvent.click(within(group).getByRole('button', { name: 'Close' }));
    expect(suggestionViewFor(TAB).arranging).toBe(false);
  });
});
