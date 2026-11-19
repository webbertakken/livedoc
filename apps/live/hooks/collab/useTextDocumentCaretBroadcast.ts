'use client';

// Where we are writing in a text document, live for collaborators
// (docs/specs/034-text-documents/live-editing-and-storage.md "Presence"): while the writing has our selection, its
// relative positions go to the room as presence at the cursor's rate, the last place always following; when the
// writing loses it, a null that drops it. Only while the room is open, and nothing while a hide-cursors vote runs
// (docs/specs/012-collaboration/session-tools.md), which retracts a caret already shown.
import { useEffect, useEffectEvent, type RefObject } from 'react';
import type { RoomOp, RoomOutgoing } from '@livedoc/api-schema';
import {
  getLocalTextDocumentCaret,
  subscribeLocalTextDocumentCaret,
} from '@/lib/text-document/text-document-carets-store';
import { BROADCAST_THROTTLE_MS } from './useEditorBroadcast';

export function useTextDocumentCaretBroadcast(deps: {
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
    const sendNow = () => {
      timer = null;
      const caret = getLocalTextDocumentCaret();
      if (!caret) return;
      lastSent = Date.now();
      shownOn = caret.tabId;
      send({ kind: 'text-document-caret', ...caret });
    };
    const retract = () => {
      if (shownOn) send({ kind: 'text-document-caret', tabId: shownOn, anchor: null });
      shownOn = null;
    };
    const onChange = () => {
      if (!getLocalTextDocumentCaret()) {
        if (timer) clearTimeout(timer);
        timer = null;
        retract();
        return;
      }
      if (timer) return;
      const wait = lastSent + BROADCAST_THROTTLE_MS - Date.now();
      if (wait <= 0) sendNow();
      else timer = setTimeout(sendNow, wait);
    };
    const unsubscribe = subscribeLocalTextDocumentCaret(onChange);
    // Already writing (the vote closed, the room opened): show it now.
    onChange();
    return () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
      retract();
    };
  }, [live, hidden]);
}
