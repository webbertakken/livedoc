'use client';

// Bookmarks (docs/specs/034-text-documents/links-and-navigation.md "Bookmarks"): Insert > Bookmark at the caret in the
// body; a bookmark's card beside a caret at one (Copy link, Remove); going to a bookmark, from a `#name` link or from
// the document's address with `#bookmark=<name>` once the writing is drawn. Editors add and remove bookmarks; everyone
// may copy one's link and go to one.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { debugLog } from '@/lib/debug-log';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import type { Box } from '@/lib/office/popup-place';
import { track } from '@/lib/telemetry';
import {
  BOOKMARK_ITEM,
  bookmarkAt,
  bookmarkLabel,
  bookmarkHash,
  bookmarkOfHash,
  bookmarkPosition,
  bookmarkTargets,
  insertBookmark,
  newBookmarkName,
  removeBookmark,
  type BookmarkTarget,
} from '@/lib/text-document/text-document-bookmarks';
import { documentAddress } from '@/lib/text-document/text-document-links';
import { startUndoStep } from '@/lib/text-document/text-document-undo';
import { TextDocumentBookmarkCard } from './TextDocumentBookmarkCard';

type AtCaret = { pos: number; name: string; head: number; anchor: Box } | null;

const keyOf = (at: NonNullable<AtCaret>) => `${at.pos}:${at.name}@${at.head}`;
const same = (a: AtCaret, b: AtCaret) =>
  a === b ||
  (a !== null &&
    b !== null &&
    keyOf(a) === keyOf(b) &&
    a.anchor.left === b.anchor.left &&
    a.anchor.top === b.anchor.top);

export function useTextDocumentBookmarks({
  view,
  writes,
  ready,
  documentId,
  subscribe,
}: {
  // The body's writing: bookmarks live there.
  view: EditorView | null;
  // Whether the body may be edited now.
  writes: boolean;
  // The writing is drawn: a bookmark the address names can be gone to.
  ready: boolean;
  documentId: string;
  subscribe: (listener: () => void) => () => void;
}) {
  const [atCaret, setAtCaret] = useState<AtCaret>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [said, setSaid] = useState('');

  useEffect(() => {
    if (!view) return;
    const update = () => {
      if (view.isDestroyed) return;
      const at = bookmarkAt(view.state);
      const box = at ? view.coordsAtPos(at.pos) : null;
      const now =
        at && box
          ? {
              ...at,
              head: view.state.selection.head,
              anchor: { left: box.left, top: box.top, bottom: box.bottom },
            }
          : null;
      setAtCaret((was) => (same(was, now) ? was : now));
      setDismissed((key) => (key !== null && (!now || keyOf(now) !== key) ? null : key));
    };
    update();
    const stop = subscribe(update);
    window.addEventListener('scroll', update, true);
    return () => {
      stop();
      window.removeEventListener('scroll', update, true);
    };
  }, [view, subscribe]);

  /** Puts the caret at a bookmark and scrolls it into view; false when it is gone. */
  const goTo = useCallback(
    (name: string): boolean => {
      if (!view || view.isDestroyed) return false;
      const pos = bookmarkPosition(view.state.doc, name);
      debugLog('[text-document] bookmark gone to', { found: pos !== null });
      if (pos === null) return false;
      view.dispatch(
        view.state.tr
          .setSelection(TextSelection.near(view.state.doc.resolve(pos + 1)))
          .setMeta('addToHistory', false)
          .scrollIntoView(),
      );
      view.focus();
      return true;
    },
    [view],
  );

  // The document's address naming a bookmark goes to it once the writing is drawn.
  useEffect(() => {
    if (!ready || !view) return;
    const name = bookmarkOfHash(window.location.hash);
    if (name === null) return;
    const frame = requestAnimationFrame(() => goTo(name));
    return () => cancelAnimationFrame(frame);
  }, [ready, view, goTo]);

  const insert = useCallback(() => {
    if (!view || view.isDestroyed || !writes) return;
    startUndoStep(view);
    const done = insertBookmark(newBookmarkName(view.state.doc))(view.state, view.dispatch);
    startUndoStep(view);
    if (done) track('Element', 'Added', 'TextDocumentBookmark');
    debugLog('[text-document] bookmark added', { done });
    view.focus();
  }, [view, writes]);

  const actions = useMemo(
    (): OfficeActions => (writes && view ? { [BOOKMARK_ITEM]: { run: insert } } : {}),
    [writes, view, insert],
  );

  /** The bookmarks the link editor offers for what is typed. */
  const targets = useCallback(
    (typed: string): BookmarkTarget[] =>
      view && !view.isDestroyed ? bookmarkTargets(view.state.doc, typed) : [],
    [view],
  );

  const shownAt = view ? atCaret : null;
  const cardShown = shownAt !== null && dismissed !== keyOf(shownAt);
  useEffect(() => {
    const dom = view?.dom;
    if (!dom || !cardShown || !shownAt) return;
    const key = keyOf(shownAt);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDismissed(key);
    };
    dom.addEventListener('keydown', onKeyDown);
    return () => dom.removeEventListener('keydown', onKeyDown);
  }, [view, cardShown, shownAt]);

  const card =
    cardShown && shownAt ? (
      <TextDocumentBookmarkCard
        anchor={shownAt.anchor}
        onCopy={() => {
          const address = `${documentAddress(documentId, window.location.origin)}${bookmarkHash(shownAt.name)}`;
          navigator.clipboard?.writeText(address).then(
            () => setSaid('Link copied'),
            (error: unknown) => debugLog('[text-document] bookmark copy failed', String(error)),
          );
        }}
        onRemove={
          writes
            ? () => {
                if (!view || view.isDestroyed) return;
                startUndoStep(view);
                const done = removeBookmark(shownAt.pos)(view.state, view.dispatch);
                startUndoStep(view);
                if (done) track('Element', 'Removed', 'TextDocumentBookmark');
                debugLog('[text-document] bookmark removed', { done });
                view.focus();
              }
            : null
        }
      />
    ) : null;

  const status = (
    <p role="status" className="sr-only">
      {said}
    </p>
  );

  const label = useCallback(
    (name: string): string | null =>
      view && !view.isDestroyed ? bookmarkLabel(view.state.doc, name) : null,
    [view],
  );
  // What a link reads of this document's places, one value while the writing stays.
  const places = useMemo(() => ({ goTo, targets, label }), [goTo, targets, label]);

  return { actions, card, status, places };
}
