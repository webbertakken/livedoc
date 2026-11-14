'use client';

import { useSyncExternalStore } from 'react';
import type { AskScope } from '@livedoc/storm-reading';

// The Ask popover as one person has it (docs/specs/021-event-storming/asks.md "Where an ask starts"): open or not,
// what the ask is about, what it hangs from, and how the built-in hand is doing. The person's own view: never
// shared or saved, and closed whenever another board is looked at. Module-level, because the button in the strip,
// a context's name, a note's menu and the command palette all open the one popover from different parts of the
// tree.

/** What the popover hangs from and hands focus back to: an element, or a place standing in for one that has gone
 *  (a menu's row, the command palette). */
export type AskAnchor = Pick<HTMLElement, 'getBoundingClientRect' | 'focus' | 'contains'>;

export type AskView = {
  tabId: string | null;
  open: boolean;
  // What the ask is about, as it was when the popover opened.
  scope: AskScope;
  anchor: AskAnchor | null;
  // The built-in hand is at work.
  asking: boolean;
  // Why the last ask failed, in the popover's words.
  failure: string | null;
};

const CLOSED: Omit<AskView, 'tabId'> = {
  open: false,
  scope: { type: 'board' },
  anchor: null,
  asking: false,
  failure: null,
};

let view: AskView = { tabId: null, ...CLOSED };
const listeners = new Set<() => void>();

function publish(next: AskView): void {
  view = next;
  for (const l of listeners) l();
}

/** The view for this board: closed when the stored view is another board's. */
export function askViewFor(tabId: string): AskView {
  return view.tabId === tabId ? view : { tabId, ...CLOSED };
}

const update = (tabId: string, change: Partial<AskView>) =>
  publish({ ...askViewFor(tabId), ...change, tabId });

export function openAsk(tabId: string, scope: AskScope, anchor: AskAnchor): void {
  update(tabId, { open: true, scope, anchor, failure: null });
}

/** Closes the popover; an ask under way goes on, and its suggestions arrive as any do. */
export function closeAsk(tabId: string): void {
  if (askViewFor(tabId).open) update(tabId, { open: false, anchor: null, failure: null });
}

export function setAsking(tabId: string, asking: boolean): void {
  update(tabId, { asking, ...(asking ? { failure: null } : {}) });
}

export function setAskFailure(tabId: string, failure: string | null): void {
  update(tabId, { failure, asking: false });
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

const SERVER_VIEW: AskView = { tabId: null, ...CLOSED };

export function useAskView(tabId: string): AskView {
  const stored = useSyncExternalStore(
    subscribe,
    () => view,
    () => SERVER_VIEW,
  );
  return stored.tabId === tabId ? stored : askViewFor(tabId);
}

export function resetAskViewForTests(): void {
  view = { tabId: null, ...CLOSED };
}
