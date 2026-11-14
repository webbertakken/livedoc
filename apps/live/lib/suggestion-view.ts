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
  // A peek tab's hint key, `s:<suggestion id>` for one suggestion (a panel row, a placeholder), `c:<context id>`
  // for a suggested context, a `changeKey` or `nameKey` for a suggested change, or a `planKey` for a lane plan.
  previewKey: string | null;
  // Arrange and Reorder is being previewed (docs/specs/021-event-storming/arrange.md "How a person arranges"): the
  // board draws as arranged until the person keeps it or puts it back. It outlives every hover preview.
  arranging: boolean;
};

// How far a previewed reword reaches (docs/specs/021-event-storming/suggested-changes.md "A reword ripples").
type PreviewScope = 'context' | 'board';

/** What a suggested change's preview key names: a note's change by its place among the note's changes, a name chip
 *  by its name and the contexts it is for, or the contexts a panel row's names are for. */
export type PreviewedChange =
  | { type: 'change'; noteId: string; index: number; scope: PreviewScope }
  | { type: 'name'; name: string; contextIds: string[] }
  | { type: 'contexts'; contextIds: string[] }
  // A whole board rearranged: by its open lane plan, or arranged along the timeline.
  | { type: 'lane-plan'; planId: string }
  | { type: 'arrange' };

const CHANGE_PREFIX = 'x:';
const NAME_PREFIX = 'n:';
const CONTEXTS_PREFIX = 'g:';
const CONTEXT_PREFIX = 'c:';
const PLAN_PREFIX = 'p:';

/** The key that draws the board as Arrange and Reorder would leave it. */
export const ARRANGE_KEY = 'a:';

/** The key of a lane plan's preview: the board as applying the plan would leave it. */
export function planKey(planId: string): string {
  return PLAN_PREFIX + planId;
}

/** The key of a note change's preview: the mark previews the note's first, in its context's scope. */
export function changeKey(noteId: string, index = 0, scope: PreviewScope = 'context'): string {
  return CHANGE_PREFIX + JSON.stringify([noteId, index, scope]);
}

/** The key of a name chip's preview: one context's other name, or one name for several merged. */
export function nameKey(contextIds: readonly string[], name: string): string {
  return NAME_PREFIX + JSON.stringify([name, ...contextIds]);
}

/** The key that brings several contexts forward at full strength: a Names or a Merge row pointed at. */
export function contextsKey(contextIds: readonly string[]): string {
  return CONTEXTS_PREFIX + JSON.stringify(contextIds);
}

function parsedList(json: string): unknown[] | null {
  try {
    const list: unknown = JSON.parse(json);
    return Array.isArray(list) ? list : null;
  } catch {
    return null;
  }
}

/** The suggested change a preview key names; null for any other key (a hint, a suggestion, a context) or none. */
export function parsePreviewKey(key: string | null): PreviewedChange | null {
  if (key?.startsWith(CHANGE_PREFIX)) {
    const [noteId, index, scope] = parsedList(key.slice(CHANGE_PREFIX.length)) ?? [];
    if (typeof noteId !== 'string' || typeof index !== 'number') return null;
    return { type: 'change', noteId, index, scope: scope === 'board' ? 'board' : 'context' };
  }
  if (key?.startsWith(NAME_PREFIX)) {
    const [name, ...contextIds] = parsedList(key.slice(NAME_PREFIX.length)) ?? [];
    if (typeof name !== 'string' || contextIds.length === 0) return null;
    if (!contextIds.every((id): id is string => typeof id === 'string')) return null;
    return { type: 'name', name, contextIds };
  }
  if (key?.startsWith(CONTEXTS_PREFIX)) {
    const contextIds = parsedList(key.slice(CONTEXTS_PREFIX.length)) ?? [];
    if (contextIds.length === 0) return null;
    if (!contextIds.every((id): id is string => typeof id === 'string')) return null;
    return { type: 'contexts', contextIds };
  }
  if (key === ARRANGE_KEY) return { type: 'arrange' };
  if (key?.startsWith(PLAN_PREFIX) && key.length > PLAN_PREFIX.length)
    return { type: 'lane-plan', planId: key.slice(PLAN_PREFIX.length) };
  return null;
}

/** The contexts a preview brings forward: one suggested context, those a row's names are for, or those of a chip. */
export function previewedContextIds(key: string | null): readonly string[] {
  if (key?.startsWith(CONTEXT_PREFIX)) return [key.slice(CONTEXT_PREFIX.length)];
  const parsed = parsePreviewKey(key);
  return parsed && 'contextIds' in parsed ? parsed.contextIds : [];
}

// How long a preview outlives the pointer leaving it, so the pointer can cross from a tab to its preview.
export const SUGGESTION_PREVIEW_LEAVE_MS = 160;

const DEFAULTS: Omit<SuggestionView, 'tabId'> = {
  showAll: false,
  panelOpen: false,
  previewKey: null,
  arranging: false,
};

let view: SuggestionView = { tabId: null, ...DEFAULTS };
const listeners = new Set<() => void>();
let leaveTimer: ReturnType<typeof setTimeout> | null = null;

function publish(next: SuggestionView): void {
  if (
    next.tabId === view.tabId &&
    next.showAll === view.showAll &&
    next.panelOpen === view.panelOpen &&
    next.previewKey === view.previewKey &&
    next.arranging === view.arranging
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

export function startArranging(tabId: string): void {
  update(tabId, { arranging: true });
}

export function stopArranging(tabId: string): void {
  update(tabId, { arranging: false });
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
