'use client';

import { useEffect, useRef } from 'react';
import { useLatest } from '@/hooks/ui/useLatest';

// The narrow pane's entry in the browser's history (docs/specs/013-workspace/inbox.md §1.7;
// docs/specs/013-workspace/inbox.md
// "Behaviour and state"): while the pane stands in for the list it owns one entry, so Back (the browser's,
// Android's, an iPhone's swipe) returns to the list. The page's own history state is kept, the flag merged in.
//
// - Standing: push the entry, or take it over when it is still on top (a step back on its way), never a second.
// - No longer standing while the entry is ours (Back to Inbox, Esc, or the open row gone from the list): step
//   back off it, so the next Back leaves the Inbox instead of doing nothing.
// - Back pressed: the entry is gone already; `onPopped` closes the pane.
export const INBOX_PANE_STATE = 'livedocInboxPane';

const isPaneState = (state: unknown): boolean =>
  typeof state === 'object' &&
  state !== null &&
  (state as Record<string, unknown>)[INBOX_PANE_STATE] === true;

let warned = false;
function historyUnavailable(err: unknown) {
  if (warned) return;
  warned = true;
  console.warn('[inbox] history-unavailable', err);
}

function pushPaneEntry(): boolean {
  try {
    const state: unknown = window.history.state;
    const next = { ...(state && typeof state === 'object' ? state : {}), [INBOX_PANE_STATE]: true };
    if (isPaneState(state)) window.history.replaceState(next, '');
    else window.history.pushState(next, '');
    return true;
  } catch (err) {
    // A sandboxed frame: Back stays the page's.
    historyUnavailable(err);
    return false;
  }
}

export function useInboxPaneHistory(standing: boolean, onPopped: () => void): void {
  const pushed = useRef(false);
  // Steps back we started, whose popstate is still to come: theirs, not a Back the reader pressed.
  const ownSteps = useRef(0);
  const standingNow = useLatest(standing);
  const popped = useLatest(onPopped);

  useEffect(() => {
    const onPop = () => {
      if (ownSteps.current > 0) {
        ownSteps.current -= 1;
        // A row opened again before our step back landed: the entry it took over went with that step.
        if (standingNow.current && !isPaneState(window.history.state)) {
          pushed.current = pushPaneEntry();
        }
        return;
      }
      if (!pushed.current) return;
      pushed.current = false;
      popped.current();
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [standingNow, popped]);

  useEffect(() => {
    if (standing) {
      pushed.current = pushPaneEntry();
      return;
    }
    if (!pushed.current) return;
    pushed.current = false;
    try {
      if (isPaneState(window.history.state)) {
        ownSteps.current += 1;
        window.history.back();
      }
    } catch (err) {
      historyUnavailable(err);
    }
  }, [standing]);
}
