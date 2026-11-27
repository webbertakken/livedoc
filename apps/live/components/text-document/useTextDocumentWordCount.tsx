'use client';

// Word count (docs/specs/034-text-documents/tools.md "Word count"): Tools > Word count and ⌘⇧C open the dialog on the
// counts as they are; Display word count while typing, the person's own, keeps a box at the bottom left current as
// anyone writes, counted a moment after the writing settles so typing never waits on it. The body is counted; a
// selection, in the body or in a header, footer or note being edited, is counted as the part.
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { EditorView } from 'prosemirror-view';
import { debugLog } from '@/lib/debug-log';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import { track } from '@/lib/telemetry';
import {
  PREFERENCES_CHANGED_EVENT,
  readUserPreferences,
  writeUserPreferences,
} from '@/lib/user-preferences';
import {
  countWriting,
  NO_COUNTS,
  type WordCounts,
} from '@/lib/text-document/text-document-word-count';
import {
  TextDocumentWordCountBox,
  nextShows,
  wordCountLine,
  type WordCountShows,
} from './TextDocumentWordCountBox';
import { TextDocumentWordCountDialog } from './TextDocumentWordCountDialog';

/** Tools > Word count's item, and its shortcut row. */
export const WORD_COUNT_ITEM = 'word-count';

/** How long the writing settles before the box counts again (safe range 100..1,000 ms; (default)). */
export const WORD_COUNT_SETTLE_MS = 300;

function subscribeSetting(changed: () => void): () => void {
  window.addEventListener(PREFERENCES_CHANGED_EVENT, changed);
  window.addEventListener('storage', changed);
  return () => {
    window.removeEventListener(PREFERENCES_CHANGED_EVENT, changed);
    window.removeEventListener('storage', changed);
  };
}
const readSetting = (): boolean => readUserPreferences().textDocumentWordCountWhileTyping === true;
const notOnTheServer = (): boolean => false;

type Counted = { readonly counts: WordCounts; readonly selected: WordCounts | null };

/** The body's counts, and the selection's where one is made in the editor the person is in. */
function countNow(body: EditorView, active: EditorView): Counted {
  const counts = countWriting(body.state.doc);
  const { from, to, empty } = active.state.selection;
  return { counts, selected: empty ? null : countWriting(active.state.doc, from, to) };
}

export function useTextDocumentWordCount({
  view,
  activeView,
  subscribe,
  subscribeCaret,
  pages,
  ownerId,
}: {
  /** The body's editor. */
  view: EditorView | null;
  /** The editor the person is in: the body, or a header, footer or note being edited. */
  activeView: EditorView | null;
  /** Tells when the body changed, by anyone. */
  subscribe: (listener: () => void) => () => void;
  /** Tells when the caret or selection moved. */
  subscribeCaret: (listener: () => void) => () => void;
  /** The pages laid out; null where there are none. */
  pages: number | null;
  /** The person: the setting follows their account, else this browser. */
  ownerId: string | null;
}) {
  const whileTyping = useSyncExternalStore(subscribeSetting, readSetting, notOnTheServer);
  const [opened, setOpened] = useState<Counted | null>(null);
  const [counted, setCounted] = useState<Counted>({ counts: NO_COUNTS, selected: null });
  const [shows, setShows] = useState<WordCountShows>('words');
  const body = view && !view.isDestroyed ? view : null;
  const active = activeView && !activeView.isDestroyed ? activeView : body;

  const open = useCallback(() => {
    if (!body || !active) return;
    track('UI', 'Opened', 'TextDocumentWordCount');
    const now = countNow(body, active);
    debugLog('[text-document] word count', {
      words: now.counts.words,
      selected: now.selected !== null,
    });
    setOpened(now);
  }, [body, active]);

  const toggle = useCallback(
    (on: boolean) => {
      // Counted before it is kept, as every setting flip is.
      track(
        'UI',
        'Toggled',
        on ? 'TextDocumentWordCountWhileTypingOn' : 'TextDocumentWordCountWhileTypingOff',
      );
      writeUserPreferences(
        { ...readUserPreferences(), textDocumentWordCountWhileTyping: on },
        ownerId,
      );
      debugLog('[text-document] word count while typing', { on });
    },
    [ownerId],
  );

  // While the box shows: counted now, then a moment after each change to the writing or the selection settles.
  useEffect(() => {
    if (!whileTyping || !body || !active) return undefined;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const count = () => {
      timer = null;
      if (!body.isDestroyed && !active.isDestroyed) setCounted(countNow(body, active));
    };
    const later = () => {
      if (timer === null) timer = setTimeout(count, WORD_COUNT_SETTLE_MS);
    };
    count();
    const stopWriting = subscribe(later);
    const stopCaret = subscribeCaret(later);
    return () => {
      if (timer !== null) clearTimeout(timer);
      stopWriting();
      stopCaret();
    };
  }, [whileTyping, body, active, subscribe, subscribeCaret]);

  const actions = useMemo(
    (): OfficeActions => (body ? { [WORD_COUNT_ITEM]: { run: open } } : {}),
    [body, open],
  );

  const close = () => {
    setOpened(null);
    active?.focus();
  };
  const dialog = opened ? (
    <TextDocumentWordCountDialog
      counts={opened.counts}
      selected={opened.selected}
      pages={pages}
      whileTyping={whileTyping}
      onWhileTyping={toggle}
      onClose={close}
    />
  ) : null;
  // Pages gone (pageless now): back to words.
  const showing = shows === 'pages' && pages === null ? 'words' : shows;
  const box =
    whileTyping && body ? (
      <TextDocumentWordCountBox
        line={wordCountLine(showing, counted.counts, counted.selected, pages)}
        onPress={() => setShows(nextShows(showing, pages))}
      />
    ) : null;
  return { actions, dialog, box };
}
