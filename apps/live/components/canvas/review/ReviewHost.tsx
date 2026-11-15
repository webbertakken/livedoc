'use client';

import { useEffect, useLayoutEffect, useRef, type KeyboardEvent } from 'react';
import type { ElementId, Tab } from '@livedoc/document';
import { Portal } from '@livedoc/ui';
import { CORNER_SURFACE } from '@/components/canvas/corner';
import type { ReviewActions } from '@/hooks/canvas/useReviewActions';
import { useReviewPanel } from '@/hooks/canvas/useReviewPanel';
import { closeReview } from '@/lib/review-view';
import { focusReviewButton } from './ReviewButton';
import { ReviewPanel } from './ReviewPanel';

// Where the Review panel stands (docs/specs/021-event-storming/board-review.md "The panel"): a card under the
// corner its pill is in, where the suggestions list opens. Drawn beside the canvas, which knows the tab and what
// the session may do; mounted for everyone on an event-storming board, and nothing shows until the panel is opened.
// This file alone says where the panel stands; its working parts are `useReviewPanel`'s, its tabs `ReviewPanel`'s.

const CARD_PLACE = 'fixed right-3';
const CARD_SIZE = 'w-[360px] max-w-[calc(100vw-1.5rem)]';
/** Between the corner and the card, px (safe range: 4 to 12; the corner's own inset from the window is 12). */
const CARD_GAP_PX = 8;
/** Where the card's top stands when no corner is drawn to measure (a drag in hand, zen mode): under where it was. */
const CARD_TOP_FALLBACK_PX = 105;
/** What the card leaves free at the foot of the window, as the suggestions list does. */
const CARD_FOOT = '6rem';

export function ReviewHost({
  tab,
  acts,
  inertIds,
  reveal,
  mayWrite,
}: {
  tab: Tab;
  acts: ReviewActions;
  // Elements that may not change: locked, or on a hidden or locked layer.
  inertIds: ReadonlySet<ElementId>;
  // Pans the board so a rectangle of it is in view, beside the card (a screen x the view ends before).
  reveal: (
    rect: { x: number; y: number; width: number; height: number },
    clear: { clearRightOf?: number },
  ) => void;
  // Whether Add, Answer and Rename Term are offered: an Editor's alone.
  mayWrite: boolean;
}) {
  const card = useRef<HTMLElement>(null);
  // What a row names lands in the part of the board the card leaves free, not under the card.
  const { view, reading, setTab, panelActs } = useReviewPanel({
    tab,
    acts,
    inertIds,
    reveal: (rect) => reveal(rect, { clearRightOf: card.current?.getBoundingClientRect().left }),
  });
  // Under the corner its pill stands in, measured as the panel opens: how tall the pill is is the font's to say.
  useLayoutEffect(() => {
    const node = card.current;
    if (!view.open || !node) return;
    const corner = document.querySelector('[data-review-button]')?.closest('[data-corner]');
    const bottom = corner?.getBoundingClientRect().bottom ?? 0;
    const top = bottom > 0 ? Math.round(bottom) + CARD_GAP_PX : CARD_TOP_FALLBACK_PX;
    node.style.top = `${top}px`;
    node.style.maxHeight = `calc(100vh - ${top}px - ${CARD_FOOT})`;
  }, [view.open]);
  // Opening hands the keyboard to the panel: its card is drawn at the end of the page, far from the pill in the
  // tab order.
  useEffect(() => {
    if (!view.open) return;
    card.current
      ?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
      ?.focus({ preventScroll: true });
  }, [view.open]);
  if (!view.open || !reading) return null;
  // Escape closes the panel and gives the keyboard back to its pill. A tab that has something of its own to let go
  // of first (a chosen term, a rename under way) stops the key before it reaches here.
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    closeReview(tab.id);
    focusReviewButton();
  };
  return (
    <Portal>
      <aside
        ref={card}
        aria-label="Review"
        data-testid="review-panel"
        onKeyDown={onKeyDown}
        className={`${CARD_PLACE} ${CARD_SIZE} ${CORNER_SURFACE} flex flex-col overflow-hidden rounded-xl`}
      >
        <ReviewPanel
          tab={view.tab}
          reading={reading}
          mayWrite={mayWrite}
          onTab={setTab}
          acts={panelActs}
        />
      </aside>
    </Portal>
  );
}
