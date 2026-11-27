'use client';

// Screen reader support (docs/specs/034-text-documents/tools.md "Accessibility settings"): the person's switch, from
// Tools > Accessibility's dialog or ⌘⌥Z, said aloud as it turns; while it is on, the Accessibility menu and its keys
// say where the caret is, what is selected, its formatting, the word count, the table cell and the comment there,
// through this surface's own polite live region (never the canvas's, so a split view never speaks twice).
import { useCallback, useMemo, useState, useSyncExternalStore, type RefObject } from 'react';
import type { EditorView } from 'prosemirror-view';
import type * as Y from 'yjs';
import type { TextDocumentFormat } from '@livedoc/document';
import { debugLog } from '@/lib/debug-log';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import { track } from '@/lib/telemetry';
import { PREFERENCES_CHANGED_EVENT } from '@/lib/user-preferences';
import { focusWriting } from '@/lib/text-document/text-document-focus';
import { textFormattingReader } from '@/lib/text-document/useTextDocumentFormatting';
import type { ThreadStretch } from '@/lib/text-document/text-document-threads';
import {
  ACCESSIBILITY_ITEM,
  ACCESSIBILITY_SETTINGS_ITEM,
  readScreenReaderSupport,
  SCREEN_READER_DISABLED,
  SCREEN_READER_ENABLED,
  SCREEN_READER_KEY,
  writeScreenReaderSupport,
} from '@/lib/text-document/text-document-screen-reader';
import {
  sayComment,
  sayCommentAnchor,
  sayCursorLocation,
  sayFormatting,
  sayFromCursor,
  saySelection,
  sayTableCell,
  sayTableHeaders,
  sayWordCount,
} from '@/lib/text-document/text-document-verbalise';
import type { TextDocumentThread } from '@livedoc/text-documents';
import { TextDocumentAccessibilityDialog } from './TextDocumentAccessibilityDialog';

/** The verbalise commands: each one's menu item and its shortcut row share this id. */
export const VERBALISE_ITEMS = {
  selection: 'verbalize-selection',
  fromCursor: 'verbalize-from-cursor-location',
  cursorLocation: 'verbalize-cursor-location',
  announceCursorLocation: 'announce-cursor-location',
  selectionFormatting: 'verbalize-selection-formatting',
  announceFormatting: 'announce-formatting-at-cursor-location',
  wordCount: 'verbalize-word-count',
  tableCell: 'verbalize-table-cell-location',
  tableHeaders: 'verbalize-table-row-and-column-headers',
  tableRowHeader: 'verbalize-table-row-header',
  tableColumnHeader: 'verbalize-table-column-header',
  comment: 'verbalize-comment',
  commentAnchor: 'verbalize-comment-anchor',
} as const;

function subscribeSetting(changed: () => void): () => void {
  window.addEventListener(PREFERENCES_CHANGED_EVENT, changed);
  window.addEventListener('storage', changed);
  return () => {
    window.removeEventListener(PREFERENCES_CHANGED_EVENT, changed);
    window.removeEventListener('storage', changed);
  };
}
const notOnTheServer = (): boolean => false;

const live = (view: EditorView | null): EditorView | null =>
  view && !view.isDestroyed ? view : null;

export function useTextDocumentScreenReader({
  view,
  activeView,
  liveDoc,
  format,
  pageAt,
  threads,
  ownerId,
}: {
  /** The body's editor. */
  view: EditorView | null;
  /** The editor the person is in: the body, or a header, footer or note being edited. */
  activeView: EditorView | null;
  /** The live state the styles and defaults are read from, and its format. */
  liveDoc: RefObject<Y.Doc | null>;
  format: TextDocumentFormat;
  /** The page a place in the body is on and the pages laid out; null where none are. */
  pageAt: (pos: number) => { readonly page: number; readonly pages: number } | null;
  /** The comment threads and where they lie in the body. */
  threads: {
    readonly threads: readonly TextDocumentThread[];
    readonly stretches: readonly ThreadStretch[];
  };
  /** The person: the setting follows their account, else this browser. */
  ownerId: string | null;
}) {
  const on = useSyncExternalStore(subscribeSetting, readScreenReaderSupport, notOnTheServer);
  const [said, setSaid] = useState({ text: '', n: 0 });
  const [dialogOpen, setDialogOpen] = useState(false);

  const say = useCallback((text: string) => setSaid((was) => ({ text, n: was.n + 1 })), []);

  const toggle = useCallback(
    (next: boolean) => {
      // Counted before it is kept, as every setting flip is.
      track('UI', 'Toggled', next ? 'TextDocumentScreenReaderOn' : 'TextDocumentScreenReaderOff');
      writeScreenReaderSupport(next, ownerId);
      debugLog('[text-document] screen reader', { on: next });
      say(next ? SCREEN_READER_ENABLED : SCREEN_READER_DISABLED);
    },
    [ownerId, say],
  );

  const body = live(view);
  const active = live(activeView) ?? body;

  const actions = useMemo((): OfficeActions => {
    const open = { run: () => setDialogOpen(true) };
    const always: OfficeActions = {
      [ACCESSIBILITY_ITEM]: open,
      [SCREEN_READER_KEY]: { run: () => toggle(!readScreenReaderSupport()) },
    };
    if (!on || !body || !active) return always;
    const readFormatting = textFormattingReader(active, liveDoc, format);
    const verbalise = (name: string, saying: () => string) => ({
      run: () => {
        if (body.isDestroyed || active.isDestroyed) {
          debugLog('[text-document] verbalise skipped', { name });
          return;
        }
        debugLog('[text-document] verbalise', { name });
        say(saying());
      },
    });
    const location = () =>
      sayCursorLocation(active.state, readFormatting(), pageAt(body.state.selection.from));
    const formatting = () => sayFormatting(active.state, readFormatting());
    return {
      ...always,
      [ACCESSIBILITY_SETTINGS_ITEM]: open,
      [VERBALISE_ITEMS.selection]: verbalise('selection', () => saySelection(active.state)),
      [VERBALISE_ITEMS.fromCursor]: verbalise('from cursor', () => sayFromCursor(active.state)),
      [VERBALISE_ITEMS.cursorLocation]: verbalise('cursor location', location),
      [VERBALISE_ITEMS.announceCursorLocation]: verbalise('cursor location', location),
      [VERBALISE_ITEMS.selectionFormatting]: verbalise('formatting', formatting),
      [VERBALISE_ITEMS.announceFormatting]: verbalise('formatting', formatting),
      [VERBALISE_ITEMS.wordCount]: verbalise('word count', () =>
        sayWordCount(body.state.doc, active === body ? body.state.selection : null),
      ),
      [VERBALISE_ITEMS.tableCell]: verbalise('table cell', () => sayTableCell(body.state)),
      [VERBALISE_ITEMS.tableHeaders]: verbalise('table headers', () =>
        sayTableHeaders(body.state, 'both'),
      ),
      [VERBALISE_ITEMS.tableRowHeader]: verbalise('table row header', () =>
        sayTableHeaders(body.state, 'row'),
      ),
      [VERBALISE_ITEMS.tableColumnHeader]: verbalise('table column header', () =>
        sayTableHeaders(body.state, 'column'),
      ),
      [VERBALISE_ITEMS.comment]: verbalise('comment', () => sayComment(body.state, threads)),
      [VERBALISE_ITEMS.commentAnchor]: verbalise('comment anchor', () =>
        sayCommentAnchor(body.state, threads),
      ),
    };
  }, [on, body, active, toggle, say, liveDoc, format, pageAt, threads]);

  const close = useCallback(() => {
    setDialogOpen(false);
    focusWriting(active);
  }, [active]);

  const dialog = dialogOpen ? (
    <TextDocumentAccessibilityDialog screenReader={on} onScreenReader={toggle} onClose={close} />
  ) : null;

  // The alternating no-break space makes a repeated sentence a change, so it is read again.
  const region = (
    <p
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="sr-only"
      data-screen-reader-region
    >
      {said.text}
      {said.n % 2 === 1 ? '\u00a0' : ''}
    </p>
  );

  return { on, actions, dialog, region };
}
