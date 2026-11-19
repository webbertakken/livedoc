'use client';

import type { KeyboardEvent } from 'react';
import { Portal } from '@livedoc/ui';
import { ReviewIcon } from '@/components/canvas/review/ReviewIcon';
import { CORNER_PLACE, CORNER_SURFACE } from '@/components/canvas/corner';
import { useCornerTop } from '@/components/canvas/useCornerTop';
import { toggleReview } from '@/lib/review-open';
import { closeReview, useReviewOpen } from '@/lib/review-view';

// The Review pill (docs/specs/021-event-storming/board-review.md "The panel"): in the corner beside Ask, for everyone
// on the board. It opens and closes the Review panel, and is what the panel gives the focus back to.

export function ReviewButton({ tabId }: { tabId: string }) {
  const open = useReviewOpen(tabId);
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || !open) return;
    e.preventDefault();
    e.stopPropagation();
    closeReview(tabId);
  };
  return (
    <button
      type="button"
      data-review-button=""
      // Looking a board over changes nothing about what is selected on it.
      data-keeps-context-selection=""
      aria-expanded={open}
      onClick={() => toggleReview(tabId)}
      onKeyDown={onKeyDown}
      className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 dark:text-slate-100 dark:hover:bg-slate-800 ${
        open ? 'bg-slate-100 dark:bg-slate-800' : ''
      }`}
    >
      <ReviewIcon className="text-brand-700 dark:text-brand-300" />
      <span className="text-optical-centre">Review</span>
    </button>
  );
}

/** Gives the keyboard back to the pill, wherever it stands. */
export function focusReviewButton(): void {
  document.querySelector<HTMLElement>('[data-review-button]')?.focus({ preventScroll: true });
}

/**
 * The corner for someone the suggestions corner is not drawn for (a Participant, a Viewer, anyone on a locked tab):
 * the pill alone, where that corner stands.
 */
export function ReviewCorner({ tabId }: { tabId: string }) {
  const top = useCornerTop();
  return (
    <Portal>
      <div
        data-testid="review-corner"
        data-corner=""
        className={`${CORNER_PLACE} ${CORNER_SURFACE} flex items-center rounded-full p-0.5`}
        style={{ top }}
      >
        <ReviewButton tabId={tabId} />
      </div>
    </Portal>
  );
}
