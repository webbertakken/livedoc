'use client';

// Heading links (docs/specs/034-text-documents/links-and-navigation.md "Heading links"): Copy heading link in the
// context menu while the caret is in a heading of the body; the link editor's headings beside the bookmarks; going to
// a heading from a link or from the document's address with `#heading=<id>` once the writing is drawn. A heading gains
// its id when a link first needs it, as no step to undo; a session that may not edit copies only an id given already.
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Transaction } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { Bookmarks, type Style } from '@livedoc/text-documents';
import { debugLog } from '@/lib/debug-log';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import { track } from '@/lib/telemetry';
import { bookmarkNames, type BookmarkTarget } from '@/lib/text-document/text-document-bookmarks';
import {
  HEADING_LINK_COPY_ITEM,
  claimHeadingId,
  giveHeadingId,
  headingAt,
  headingHash,
  headingLabel,
  headingOfHash,
  headingTargets,
  pendingHeadingId,
} from '@/lib/text-document/text-document-heading-links';
import { documentAddress } from '@/lib/text-document/text-document-links';
import type { InDocument, PlaceTarget } from './useTextDocumentLinks';

/** The bookmarks' places, as useTextDocumentBookmarks hands them. */
export type BookmarkPlaces = {
  goTo: (name: string) => boolean;
  targets: (typed: string) => readonly BookmarkTarget[];
  label: (name: string) => string | null;
};

// The caret's heading: where its paragraph starts and whether it has an id.
type AtCaret = { pos: number; id: string | null } | null;
const same = (a: AtCaret, b: AtCaret) =>
  a === b || (a !== null && b !== null && a.pos === b.pos && a.id === b.id);

// Gaining an id is no step to undo.
const unrecorded = (view: EditorView) => (tr: Transaction) =>
  view.dispatch(tr.setMeta('addToHistory', false));

export function useTextDocumentHeadingLinks({
  view,
  writes,
  ready,
  documentId,
  readStyles,
  subscribe,
  bookmarks,
}: {
  // The body's writing: headings live there.
  view: EditorView | null;
  // Whether the body may be edited now.
  writes: boolean;
  // The writing is drawn: a heading the address names can be gone to.
  ready: boolean;
  documentId: string;
  // The styles a heading's level is read through.
  readStyles: () => readonly Style[];
  subscribe: (listener: () => void) => () => void;
  bookmarks: BookmarkPlaces;
}) {
  const [atCaret, setAtCaret] = useState<AtCaret>(null);
  const [said, setSaid] = useState('');

  useEffect(() => {
    if (!view) return;
    const update = () => {
      if (view.isDestroyed) return;
      const heading = headingAt(view.state, readStyles());
      const now = heading ? { pos: heading.pos, id: heading.id } : null;
      setAtCaret((was) => (same(was, now) ? was : now));
    };
    update();
    return subscribe(update);
  }, [view, subscribe, readStyles]);

  const copy = useCallback(() => {
    if (!view || view.isDestroyed) return;
    const heading = headingAt(view.state, readStyles());
    if (!heading) return;
    let id = heading.id;
    if (id === null && writes) {
      id = Bookmarks.newHeadingId(bookmarkNames(view.state.doc));
      if (!giveHeadingId(heading.pos, id)(view.state, unrecorded(view))) id = null;
    }
    debugLog('[text-document] heading link copied', { given: heading.id === null, ok: !!id });
    if (id === null) return;
    const address = `${documentAddress(documentId, window.location.origin)}${headingHash(id)}`;
    navigator.clipboard?.writeText(address).then(
      () => {
        setSaid('Link copied');
        track('UI', 'Used', 'TextDocumentHeadingLinkCopied');
      },
      (error: unknown) => debugLog('[text-document] heading link copy failed', String(error)),
    );
  }, [view, writes, readStyles, documentId]);

  const shownAt = view ? atCaret : null;
  const actions = useMemo(
    (): OfficeActions =>
      shownAt && (shownAt.id !== null || writes) ? { [HEADING_LINK_COPY_ITEM]: { run: copy } } : {},
    [shownAt, writes, copy],
  );

  const { goTo } = bookmarks;
  // The document's address naming a heading goes to it once the writing is drawn.
  useEffect(() => {
    if (!ready || !view) return;
    const id = headingOfHash(window.location.hash);
    if (id === null) return;
    const frame = requestAnimationFrame(() => goTo(id));
    return () => cancelAnimationFrame(frame);
  }, [ready, view, goTo]);

  /** The headings, then the bookmarks, the link editor offers for what is typed. */
  const targets = useCallback(
    (typed: string): PlaceTarget[] => {
      const headings =
        view && !view.isDestroyed
          ? headingTargets(view.state.doc, readStyles(), typed).map((h): PlaceTarget => ({
              group: 'headings',
              name: h.id ?? pendingHeadingId(view.state.doc, h.pos),
              label: h.label,
            }))
          : [];
      return [
        ...headings,
        ...bookmarks.targets(typed).map((b): PlaceTarget => ({ group: 'bookmarks', ...b })),
      ];
    },
    [view, readStyles, bookmarks],
  );

  const label = useCallback(
    (name: string): string | null =>
      (view && !view.isDestroyed ? headingLabel(view.state.doc, readStyles(), name) : null) ??
      bookmarks.label(name),
    [view, readStyles, bookmarks],
  );

  // A link to a heading not yet given its id gives it as the link is applied.
  const claim = useCallback(
    (name: string) => {
      if (!view || view.isDestroyed || !writes) return;
      const given = claimHeadingId(name, readStyles())(view.state, unrecorded(view));
      if (given) debugLog('[text-document] heading id given', { by: 'link' });
    },
    [view, writes, readStyles],
  );

  const places = useMemo(
    (): InDocument => ({ goTo, targets, label, claim }),
    [goTo, targets, label, claim],
  );

  const status = (
    <p role="status" className="sr-only">
      {said}
    </p>
  );

  return { actions, status, places };
}
