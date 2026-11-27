'use client';

// Show live edits (docs/specs/034-text-documents/tools.md "Accessibility settings", Show live edits): while the Live
// edits panel is open, every change the room brings to the writing shown is read for the text it added and removed and
// put to its sender, as the room named them; an author's changes a moment apart join one entry, and the newest is
// read once it settles. Nothing is kept once the panel closes.
import { useEffect, useState } from 'react';
import type { EditorView } from 'prosemirror-view';
import type * as Y from 'yjs';
import { debugLog } from '@/lib/debug-log';
import { ROOM_ORIGIN, ROOM_SENDER } from '@/lib/live-tab/live-tab-room-binding';
import { textDocumentPersonOf } from '@/lib/text-document/text-document-carets-store';
import {
  editTextOf,
  LIVE_EDIT_JOIN_MS,
  LiveEdits,
  type LiveEdit,
} from '@/lib/text-document/text-document-live-edits';
import { bindingOf } from '@/lib/text-document/text-document-relative-positions';

/** Who a sender the room did not name, or who has left, is read as ((default)). */
export const SOMEONE = 'Someone';

export function useTextDocumentLiveEdits({
  view,
  open,
}: {
  /** The body's editor. */
  view: EditorView | null;
  /** The Live edits panel is open. */
  open: boolean;
}) {
  const [entries, setEntries] = useState<readonly LiveEdit[]>([]);
  const [said, setSaid] = useState('');
  const writing = open && view && !view.isDestroyed ? (bindingOf(view.state)?.type ?? null) : null;

  useEffect(() => {
    if (!writing) return undefined;
    const fragment = writing;
    const heard = (events: Y.YEvent<Y.AbstractType<unknown>>[], tr: Y.Transaction) => {
      if (tr.origin !== ROOM_ORIGIN) return;
      const from = tr.meta.get(ROOM_SENDER) as string | undefined;
      if (!from) {
        debugLog('[text-document] live edit unattributed', {});
        return;
      }
      const { added, removed } = editTextOf(events);
      const name = textDocumentPersonOf(from)?.name ?? SOMEONE;
      setEntries((was) => LiveEdits.add(was, { from, name, added, removed }, Date.now()));
    };
    fragment.observeDeep(heard);
    debugLog('[text-document] live edits', { open: true });
    return () => {
      fragment.unobserveDeep(heard);
      setEntries([]);
      setSaid('');
      debugLog('[text-document] live edits', { open: false });
    };
  }, [writing]);

  // The newest entry is read once its author pauses, so a run of typing is read once.
  const newest = entries[0];
  useEffect(() => {
    if (!newest) return undefined;
    const timer = setTimeout(() => setSaid(LiveEdits.say(newest)), LIVE_EDIT_JOIN_MS);
    return () => clearTimeout(timer);
  }, [newest]);

  return { entries, said };
}
