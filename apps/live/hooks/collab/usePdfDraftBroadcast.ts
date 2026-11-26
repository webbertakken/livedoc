'use client';

// A Drawing's stroke as it is drawn, live for collaborators (docs/specs/035-pdf-documents/live-editing-and-storage.md
// "A mark as it is made"): the points the surface adds go to the room at the cursor's rate, the last always following,
// each op the points since the last (at most PDF_DRAFT_MAX_POINTS, a longer stretch as several), and the stroke's end
// once it is let go. A stroke past PDF_DRAWING_MAX_POINTS sends no more of itself. Only while the room is open, and
// nothing while a hide-cursors vote runs, which ends a stroke already shown.
import { useEffect, useEffectEvent, type RefObject } from 'react';
import { PDF_DRAFT_MAX_POINTS, type RoomOp, type RoomOutgoing } from '@livedoc/api-schema';
import { PDF_DRAWING_MAX_POINTS } from '@livedoc/pdf-documents';
import {
  getLocalPdfDraft,
  subscribeLocalPdfDraft,
  type PdfLocalDraft,
} from '@/lib/pdf-document/pdf-draft-store';
import { BROADCAST_THROTTLE_MS } from './useEditorBroadcast';

export function usePdfDraftBroadcast(deps: {
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
    // The stroke shown: its tab and id, and how many of its points went.
    let shown: { tabId: string; stroke: string; sent: number } | null = null;
    // The stroke last in hand, as last seen: a stroke let go still sends its last points.
    let seen: PdfLocalDraft | null = null;
    let lastSent = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const sendPoints = (draft: PdfLocalDraft) => {
      if (shown?.stroke !== draft.stroke)
        shown = { tabId: draft.tabId, stroke: draft.stroke, sent: 0 };
      const total = Math.min(draft.points.length / 2, PDF_DRAWING_MAX_POINTS);
      while (shown.sent < total) {
        const count = Math.min(total - shown.sent, PDF_DRAFT_MAX_POINTS);
        send({
          kind: 'pdf-draft',
          tabId: draft.tabId,
          page: draft.page,
          stroke: draft.stroke,
          ...draft.look,
          from: shown.sent,
          points: draft.points.slice(shown.sent * 2, (shown.sent + count) * 2),
        });
        shown.sent += count;
      }
    };
    const end = () => {
      if (shown)
        send({ kind: 'pdf-draft', tabId: shown.tabId, stroke: shown.stroke, points: null });
      shown = null;
    };
    const sendNow = () => {
      timer = null;
      lastSent = Date.now();
      const draft = getLocalPdfDraft();
      // The stroke shown, let go or followed by another: its last points, then its end.
      if (shown && shown.stroke !== draft?.stroke) {
        if (seen?.stroke === shown.stroke) sendPoints(seen);
        end();
      }
      if (draft) sendPoints(draft);
    };
    const onChange = () => {
      seen = getLocalPdfDraft() ?? seen;
      if (timer) return;
      const wait = lastSent + BROADCAST_THROTTLE_MS - Date.now();
      if (wait <= 0) sendNow();
      else timer = setTimeout(sendNow, wait);
    };
    const unsubscribe = subscribeLocalPdfDraft(onChange);
    return () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
      end();
    };
  }, [live, hidden]);
}
