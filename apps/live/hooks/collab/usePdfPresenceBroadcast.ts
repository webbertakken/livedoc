'use client';

// Where we are in a PDF document, live for collaborators
// (docs/specs/035-pdf-documents/live-editing-and-storage.md "Presence"): the place the surface publishes goes to the
// room as presence at the cursor's rate, the last place always following, and is said again when the store asks
// (someone joined); when we leave the tab, a null page that drops it. Only while the room is open, and nothing while a
// hide-cursors vote runs (docs/specs/012-collaboration/session-tools.md), which takes back a place already shown.
import { useEffect, useEffectEvent, type RefObject } from 'react';
import type { RoomOp, RoomOutgoing } from '@livedoc/api-schema';
import {
  getLocalPdfPresence,
  subscribeLocalPdfPresence,
} from '@/lib/pdf-document/pdf-presence-store';
import { BROADCAST_THROTTLE_MS } from './useEditorBroadcast';

export function usePdfPresenceBroadcast(deps: {
  roomRef: RefObject<{ send: (msg: RoomOutgoing) => void } | null>;
  // The room is open for this document (hydrated, and shared or a team's).
  live: boolean;
  // A hide-cursors vote is open on the active tab.
  hidden: boolean;
}): void {
  const send = useEffectEvent((op: RoomOp) => {
    deps.roomRef.current?.send({ kind: 'op', op });
  });
  const { live, hidden } = deps;

  useEffect(() => {
    if (!live || hidden) return;
    let shownOn: string | null = null;
    let lastSent = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const retract = () => {
      if (shownOn) send({ kind: 'pdf-presence', tabId: shownOn, page: null });
      shownOn = null;
    };
    const sendNow = () => {
      timer = null;
      const place = getLocalPdfPresence();
      if (!place) return retract();
      lastSent = Date.now();
      shownOn = place.tabId;
      send({ kind: 'pdf-presence', ...place });
    };
    const onChange = () => {
      if (timer) return;
      const wait = lastSent + BROADCAST_THROTTLE_MS - Date.now();
      if (wait <= 0) sendNow();
      else timer = setTimeout(sendNow, wait);
    };
    const unsubscribe = subscribeLocalPdfPresence(onChange);
    // Already on a PDF (the vote closed, the room opened): show it now.
    onChange();
    return () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
      retract();
    };
  }, [live, hidden]);
}
