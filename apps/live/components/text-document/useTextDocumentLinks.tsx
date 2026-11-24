'use client';

// Links in a text document (docs/specs/034-text-documents/links-and-navigation.md "Links"): Insert > Link, the
// toolbar's Insert link, ⌘K and the context menu open the link editor in whichever writing has the caret; the link
// card shows under a link holding the caret while Show link details is on; Alt+Enter opens the link at the caret.
// Editors add, change and remove links; everyone may open and copy one.
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { EditorView } from 'prosemirror-view';
import { debugLog } from '@/lib/debug-log';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import type { Box } from '@/lib/office/popup-place';
import { track } from '@/lib/telemetry';
import {
  LINK_COPY_ITEM,
  LINK_EDIT_ITEM,
  LINK_INSERT_ITEM,
  LINK_ITEM,
  LINK_REMOVE_ITEM,
  OPEN_LINK,
  applyLink,
  documentIdOf,
  linkAddress,
  linkAt,
  linkEditing,
  linkTitle,
  openLink,
  removeLink,
  type LinkDocument,
  type LinkEditing,
  type LinkStretch,
} from '@/lib/text-document/text-document-links';
import { startUndoStep } from '@/lib/text-document/text-document-undo';
import { TextDocumentLinkCard } from './TextDocumentLinkCard';
import { TextDocumentLinkEditor } from './TextDocumentLinkEditor';

// The link at the caret, where the caret is in it, and the box under it.
type AtCaret = { link: LinkStretch; head: number; anchor: Box } | null;

const sameLink = (a: AtCaret, b: AtCaret) =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.link.from === b.link.from &&
    a.link.to === b.link.to &&
    a.link.href === b.link.href &&
    a.head === b.head &&
    a.anchor.left === b.anchor.left &&
    a.anchor.top === b.anchor.top);

// Escape hides the card until the caret moves.
const keyOf = (at: NonNullable<AtCaret>) =>
  `${at.link.from}:${at.link.to}:${at.link.href}@${at.head}`;

// The box under a stretch: its start's left, its end's line.
function boxOf(view: EditorView, from: number, to: number): Box {
  const start = view.coordsAtPos(from);
  const end = view.coordsAtPos(to);
  return {
    left: start.left,
    top: Math.min(start.top, end.top),
    bottom: Math.max(start.bottom, end.bottom),
  };
}

const origin = () => window.location.origin;

export function useTextDocumentLinks({
  view,
  writes,
  documents,
  subscribe,
  showCard,
}: {
  // The writing with the caret: the body, or a header, footer or footnote being edited.
  view: EditorView | null;
  writes: boolean;
  documents: readonly LinkDocument[];
  // Told when the caret moves or the writing changes.
  subscribe: (listener: () => void) => () => void;
  // Show link details.
  showCard: boolean;
}) {
  const [editing, setEditing] = useState<{ nonce: number; edit: LinkEditing; anchor: Box } | null>(
    null,
  );
  const [atCaret, setAtCaret] = useState<AtCaret>(null);
  // The link whose card Escape sent away, until the caret leaves it.
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [said, setSaid] = useState('');

  useEffect(() => {
    if (!view) return;
    const update = () => {
      if (view.isDestroyed) return;
      const link = view.state.selection.empty ? linkAt(view.state) : null;
      const now = link
        ? { link, head: view.state.selection.head, anchor: boxOf(view, link.from, link.to) }
        : null;
      setAtCaret((was) => (sameLink(was, now) ? was : now));
      setDismissed((key) => (key !== null && (!now || keyOf(now) !== key) ? null : key));
    };
    update();
    const stop = subscribe(update);
    // The card follows its link as the document scrolls.
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      stop();
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [view, subscribe]);

  const open = useCallback(() => {
    if (!view || view.isDestroyed || !writes) return;
    const edit = linkEditing(view.state);
    setEditing({ nonce: Date.now(), edit, anchor: boxOf(view, edit.from, edit.to) });
    debugLog('[text-document] link editor opened', { inLink: edit.href !== '' });
  }, [view, writes]);

  const close = useCallback(() => {
    setEditing(null);
    view?.focus();
  }, [view]);

  const apply = useCallback(
    (text: string | null, typed: string): string | null => {
      const was = editing?.edit;
      if (!view || view.isDestroyed || !was) return null;
      const address = linkAddress(typed);
      if ('problem' in address) {
        debugLog('[text-document] link refused', { problem: address.problem });
        return address.problem;
      }
      startUndoStep(view);
      const done = applyLink({ ...was, text, href: address.href })(view.state, view.dispatch);
      startUndoStep(view);
      if (done) {
        if (was.href === '') track('Element', 'Added', 'TextDocumentLink');
        else if (address.href === '') track('Element', 'Removed', 'TextDocumentLink');
        else track('Element', 'Changed', 'TextDocumentLink');
        debugLog('[text-document] link applied', {
          was: was.href !== '',
          now: address.href !== '',
        });
      }
      close();
      return null;
    },
    [view, editing, close],
  );

  const remove = useCallback(
    (link: LinkStretch) => {
      if (!view || view.isDestroyed || !writes) return;
      startUndoStep(view);
      const done = removeLink(link.from, link.to)(view.state, view.dispatch);
      startUndoStep(view);
      if (done) track('Element', 'Removed', 'TextDocumentLink');
      debugLog('[text-document] link removed', { done });
      view.focus();
    },
    [view, writes],
  );

  const follow = useCallback((link: LinkStretch) => {
    const opened = openLink(link.href);
    if (opened) track('UI', 'Used', 'TextDocumentLinkOpened');
    debugLog('[text-document] link opened', { opened, scheme: link.href.split(':')[0] });
  }, []);

  const copy = useCallback((link: LinkStretch) => {
    navigator.clipboard?.writeText(link.href).then(
      () => setSaid('Link copied'),
      (error: unknown) => debugLog('[text-document] link copy failed', String(error)),
    );
  }, []);

  // A writing gone leaves no link at the caret.
  const shownAt = view ? atCaret : null;
  const link = shownAt?.link ?? null;
  const actions = useMemo((): OfficeActions => {
    const onLink = link !== null;
    const reading: OfficeActions = {
      [OPEN_LINK]: { run: () => link && follow(link), disabled: !onLink },
      [LINK_COPY_ITEM]: { run: () => link && copy(link), disabled: !onLink },
    };
    if (!writes || !view) return reading;
    return {
      ...reading,
      [LINK_ITEM]: { run: open },
      [LINK_INSERT_ITEM]: { run: open, disabled: onLink },
      [LINK_EDIT_ITEM]: { run: open, disabled: !onLink },
      [LINK_REMOVE_ITEM]: { run: () => link && remove(link), disabled: !onLink },
    };
  }, [link, writes, view, open, follow, copy, remove]);

  // Escape hides the card until the caret moves.
  const cardShown =
    shownAt !== null && editing === null && dismissed !== keyOf(shownAt) && showCard;
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

  const editor = editing ? (
    <TextDocumentLinkEditor
      key={editing.nonce}
      anchor={editing.anchor}
      text={editing.edit.text}
      href={editing.edit.href}
      documents={documents}
      origin={origin()}
      onApply={apply}
      onClose={close}
    />
  ) : null;

  const card =
    cardShown && shownAt ? (
      <TextDocumentLinkCard
        anchor={shownAt.anchor}
        title={linkTitle(shownAt.link.href, documents, origin())}
        href={shownAt.link.href}
        isDocument={documentIdOf(shownAt.link.href, origin()) !== null}
        onOpen={() => follow(shownAt.link)}
        onCopy={() => copy(shownAt.link)}
        onEdit={writes ? open : null}
        onRemove={writes ? () => remove(shownAt.link) : null}
      />
    ) : null;

  const status = (
    <p role="status" className="sr-only">
      {said}
    </p>
  );

  return { actions, editor, card, status };
}
