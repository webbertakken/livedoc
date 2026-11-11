'use client';

import { useSyncExternalStore } from 'react';

// How a person is looking at a board's suggestions (docs/specs/021-event-storming/suggestions.md "How a person sees
// them"): Show All on or off, the panel open or collapsed, and which suggestion is being previewed. It is the
// person's own view: never shared, never saved with the board, and back to its defaults (Show All off, the panel
// collapsed) whenever another board opens. Module-level, because the canvas layer, the panel and the shift preview
// all read it from different parts of the tree, as the insertion preview is read.

export type SuggestionView = {
  tabId: string | null;
  showAll: boolean;
  panelOpen: boolean;
  // A peek tab's hint key, or `s:<suggestion id>` for one suggestion (a panel row, a placeholder).
  previewKey: string | null;
};

// How long a preview outlives the pointer leaving it, so the pointer can cross from a tab to its preview.
export const SUGGESTION_PREVIEW_LEAVE_MS = 160;

const DEFAULTS: Omit<SuggestionView, 'tabId'> = {
  showAll: false,
  panelOpen: false,
  previewKey: null,
};

let view: SuggestionView = { tabId: null, ...DEFAULTS };
const listeners = new Set<() => void>();
let leaveTimer: ReturnType<typeof setTimeout> | null = null;

function publish(next: SuggestionView): void {
  if (
    next.tabId === view.tabId &&
    next.showAll === view.showAll &&
    next.panelOpen === view.panelOpen &&
    next.previewKey === view.previewKey
  )
    return;
  view = next;
  for (const l of listeners) l();
}

function cancelLeave(): void {
  if (leaveTimer) clearTimeout(leaveTimer);
  leaveTimer = null;
}

// The view for this board: its defaults when the stored view is another board's.
export function suggestionViewFor(tabId: string): SuggestionView {
  return view.tabId === tabId ? view : { tabId, ...DEFAULTS };
}

function update(tabId: string, change: Partial<SuggestionView>): void {
  publish({ ...suggestionViewFor(tabId), ...change, tabId });
}

export function setShowAllSuggestions(tabId: string, showAll: boolean): void {
  update(tabId, { showAll });
}

export function setSuggestionsPanelOpen(tabId: string, panelOpen: boolean): void {
  update(tabId, { panelOpen });
}

export function previewSuggestion(tabId: string, key: string): void {
  cancelLeave();
  update(tabId, { previewKey: key });
}

// Pointer or focus left `key`: the preview ends after a beat unless something previews again.
export function leaveSuggestion(tabId: string, key: string): void {
  cancelLeave();
  leaveTimer = setTimeout(() => {
    leaveTimer = null;
    if (suggestionViewFor(tabId).previewKey === key) update(tabId, { previewKey: null });
  }, SUGGESTION_PREVIEW_LEAVE_MS);
}

export function endSuggestionPreview(tabId: string): void {
  cancelLeave();
  update(tabId, { previewKey: null });
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

const SERVER_VIEW: SuggestionView = { tabId: null, ...DEFAULTS };

export function useSuggestionView(tabId: string): SuggestionView {
  const stored = useSyncExternalStore(
    subscribe,
    () => view,
    () => SERVER_VIEW,
  );
  return stored.tabId === tabId ? stored : { tabId, ...DEFAULTS };
}
