'use client';

import { useSyncExternalStore } from 'react';
import type { ElementId } from '@livedoc/document';

// The Review panel as one person has it (docs/specs/021-event-storming/board-review.md "The panel"): open or not,
// which tab, and what it rings on the board. The person's own view: never shared or saved with the board, and closed
// whenever another board is looked at; only the tab last open is remembered, on this device. Module-level, because
// the panel is drawn in the corner and its rings among the notes, in different parts of the tree.

export type ReviewTab = 'check' | 'language' | 'story';
export const REVIEW_TABS: readonly ReviewTab[] = ['check', 'language', 'story'];
/** Where the tab last open is kept on this device. */
export const REVIEW_TAB_KEY = 'livedoc:v2:review-tab';

export type ReviewView = {
  tabId: string | null;
  open: boolean;
  tab: ReviewTab;
  // The notes ringed on the board: a Check row pointed at, a chosen term's notes, the story's step in hand.
  ringed: readonly ElementId[];
  // Whether the rest of the board dims round them: a chosen term shows where it lives.
  dim: boolean;
};

const NO_RINGS: readonly ElementId[] = [];
const CLOSED: Omit<ReviewView, 'tabId'> = {
  open: false,
  tab: 'check',
  ringed: NO_RINGS,
  dim: false,
};

let view: ReviewView = { tabId: null, ...CLOSED };
const listeners = new Set<() => void>();

function publish(next: ReviewView): void {
  view = next;
  for (const l of listeners) l();
}

// The tab last open on this device; Check the first time, and for anything that is no tab.
function rememberedTab(): ReviewTab {
  try {
    const kept = window.localStorage.getItem(REVIEW_TAB_KEY);
    return REVIEW_TABS.find((tab) => tab === kept) ?? 'check';
  } catch {
    return 'check';
  }
}

function rememberTab(tab: ReviewTab): void {
  try {
    window.localStorage.setItem(REVIEW_TAB_KEY, tab);
  } catch {
    // A browser that keeps nothing still shows the tab; it opens on Check next time.
  }
}

/** The view for this board: closed when the stored view is another board's. */
export function reviewViewFor(tabId: string): ReviewView {
  return view.tabId === tabId ? view : { tabId, ...CLOSED };
}

const update = (tabId: string, change: Partial<ReviewView>) =>
  publish({ ...reviewViewFor(tabId), ...change, tabId });

export function openReview(tabId: string): void {
  if (!reviewViewFor(tabId).open) update(tabId, { ...CLOSED, open: true, tab: rememberedTab() });
}

export function closeReview(tabId: string): void {
  if (reviewViewFor(tabId).open) update(tabId, CLOSED);
}

/** Another tab of the panel: what the last one ringed is let go. */
export function setReviewTab(tabId: string, tab: ReviewTab): void {
  rememberTab(tab);
  update(tabId, { tab, ringed: NO_RINGS, dim: false });
}

const sameIds = (a: readonly ElementId[], b: readonly ElementId[]) =>
  a.length === b.length && a.every((id, i) => id === b[i]);

/** Ring these notes on the board, dimming the rest when asked; none lets go. */
export function setReviewRings(tabId: string, ids: readonly ElementId[], dim = false): void {
  const now = reviewViewFor(tabId);
  if (!now.open || (sameIds(now.ringed, ids) && now.dim === dim)) return;
  update(tabId, { ringed: ids.length === 0 ? NO_RINGS : ids, dim: ids.length > 0 && dim });
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

const SERVER_VIEW: ReviewView = { tabId: null, ...CLOSED };

export function useReviewView(tabId: string): ReviewView {
  const stored = useSyncExternalStore(
    subscribe,
    () => view,
    () => SERVER_VIEW,
  );
  return stored.tabId === tabId ? stored : reviewViewFor(tabId);
}

export function resetReviewViewForTests(): void {
  view = { tabId: null, ...CLOSED };
}
