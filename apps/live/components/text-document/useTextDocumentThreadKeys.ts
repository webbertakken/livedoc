'use client';

// Going to a comment thread, and the keys between threads (docs/specs/034-text-documents/review.md "The comments
// panel", "Keys on a selected comment"): a press in the comments panel goes to a thread, showing its document tab
// first where it is another; an open thread is selected and its card asked for the focus, a resolved one's text is
// selected in the writing. Move to next and previous comment and Enter current comment select a thread of the tab
// shown from the caret or the selected thread, never wrapping; exit lets it go and gives the writing the keyboard.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { debugLog } from '@/lib/debug-log';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import { threadAt, threadBeside, threadStretch } from '@/lib/text-document/text-document-threads';
import type { TextDocumentThreads } from './useTextDocumentThreads';

/** The shortcuts bound here under their rows' ids (keyboard-shortcuts.md "Comments and footnotes"). */
export const MOVE_TO_NEXT_COMMENT = 'move-to-next-comment';
export const MOVE_TO_PREVIOUS_COMMENT = 'move-to-previous-comment';
export const ENTER_CURRENT_COMMENT = 'enter-current-comment';
export const COMMENT_KEY_ACTIONS: readonly string[] = [
  MOVE_TO_NEXT_COMMENT,
  MOVE_TO_PREVIOUS_COMMENT,
  ENTER_CURRENT_COMMENT,
];

/** What the status line says when a thread's text can no longer be found (review.md, (default)). */
export const TEXT_GONE = "This comment's text is gone";

/** How many frames a go waits for another tab's writing to be there before it says the text is gone. */
export const GO_FRAMES_MAX = 30;

/** A card asked for the focus; `n` tells one ask from the next for the same thread. */
export type CardFocusRequest = { readonly id: string; readonly n: number };

/** Brings a position's line into the middle of the view. */
function scrollToPos(view: EditorView, pos: number): void {
  const { node } = view.domAtPos(pos);
  const element = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  element?.scrollIntoView?.({ block: 'center' });
}

export function useTextDocumentThreadKeys({
  view,
  threads,
  tab,
  showTab,
}: {
  /** The body's editor. */
  view: EditorView | null;
  threads: TextDocumentThreads;
  /** The document tab shown. */
  tab: string;
  /** Shows another document tab. */
  showTab: (id: string) => void;
}) {
  const [pending, setPending] = useState<string | null>(null);
  const [focusRequest, setFocusRequest] = useState<CardFocusRequest | null>(null);
  const { threads: all, stretches, selected, select, say } = threads;

  /** Lands on a thread of the tab shown; false where its text is not in the writing (yet). */
  const land = useCallback(
    (id: string): boolean => {
      const thread = all.find((t) => t.id === id);
      const stretch =
        thread && view && !view.isDestroyed ? threadStretch(view.state, thread) : null;
      if (!thread || !view || !stretch) return false;
      scrollToPos(view, stretch.from);
      if (thread.resolved) {
        const { doc } = view.state;
        view.dispatch(
          view.state.tr.setSelection(TextSelection.create(doc, stretch.from, stretch.to)),
        );
        view.focus();
      } else {
        select(id);
        setFocusRequest((was) => ({ id, n: (was?.n ?? 0) + 1 }));
      }
      return true;
    },
    [all, view, select],
  );

  const go = useCallback(
    (id: string) => {
      const thread = all.find((t) => t.id === id);
      if (!thread) return;
      if (thread.tab !== tab) {
        debugLog('[text-document] thread go', { thread: id, tab: thread.tab, found: 'pending' });
        setPending(id);
        showTab(thread.tab);
        return;
      }
      const found = land(id);
      debugLog('[text-document] thread go', { thread: id, tab, found });
      if (!found) say(TEXT_GONE);
    },
    [all, tab, showTab, land, say],
  );

  // A go waiting on another tab lands once that tab is shown and its writing is there, or says the text is gone.
  useEffect(() => {
    if (pending === null) return;
    const thread = all.find((t) => t.id === pending);
    if (thread && thread.tab !== tab) return;
    let frames = 0;
    let frame = requestAnimationFrame(function attempt() {
      frames += 1;
      if (land(pending)) {
        setPending(null);
        return;
      }
      if (frames < GO_FRAMES_MAX) {
        frame = requestAnimationFrame(attempt);
        return;
      }
      debugLog('[text-document] thread go', { thread: pending, tab, found: false });
      say(TEXT_GONE);
      setPending(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [pending, all, tab, land, say]);

  const step = useCallback(
    (forward: boolean) => {
      if (!view || view.isDestroyed) return;
      const id = threadBeside(stretches, selected, view.state.selection.from, forward);
      debugLog('[text-document] thread step', { forward, thread: id });
      if (id) land(id);
    },
    [view, stretches, selected, land],
  );

  const enterCurrent = useCallback(() => {
    if (!view || view.isDestroyed) return;
    const id = threadAt(stretches, view.state.selection.from);
    debugLog('[text-document] thread enter', { thread: id });
    if (id) land(id);
  }, [view, stretches, land]);

  const exit = useCallback(() => {
    select(null);
    debugLog('[text-document] thread exit', {});
    if (view && !view.isDestroyed) view.focus();
  }, [select, view]);

  const actions: OfficeActions = useMemo(
    () =>
      stretches.length === 0
        ? {}
        : {
            [MOVE_TO_NEXT_COMMENT]: { run: () => step(true) },
            [MOVE_TO_PREVIOUS_COMMENT]: { run: () => step(false) },
            [ENTER_CURRENT_COMMENT]: { run: enterCurrent },
          },
    [stretches.length, step, enterCurrent],
  );

  return { go, step, enterCurrent, exit, focusRequest, actions };
}

export type TextDocumentThreadKeys = ReturnType<typeof useTextDocumentThreadKeys>;
