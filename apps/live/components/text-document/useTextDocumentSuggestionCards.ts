'use client';

// Suggestion cards in the editor (docs/specs/034-text-documents/review.md "Suggestion cards"): the suggestions of the
// tab shown read off the writing as it changes, the one selected, Accept and Reject as the person's rights allow (each
// one change of the writing, undone with ⌘Z, the room judging a Participant's), and Move to next and previous
// suggestion from the selected card or the caret. A press on a suggestion's row in the comments panel goes to its
// card, showing its document tab first where it is another.
import { useCallback, useEffect, useMemo, useState, type RefObject } from 'react';
import type { EditorView } from 'prosemirror-view';
import type * as Y from 'yjs';
import { LiveSuggestions } from '@livedoc/text-documents';
import { debugLog } from '@/lib/debug-log';
import { track } from '@/lib/telemetry';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import {
  cardOffers,
  suggestionBeside,
  suggestionCards,
  type SuggestionCard,
  type SuggestionRights,
} from '@/lib/text-document/text-document-suggestion-cards';
import { TEXT_DOCUMENT_SUGGESTIONS_ORIGIN } from '@/lib/text-document/text-document-undo';
import { GO_FRAMES_MAX, type CardFocusRequest } from './useTextDocumentThreadKeys';

/** What the status line says when a suggestion's row goes nowhere (review.md, (default)). */
export const SUGGESTION_GONE = 'This suggestion is gone';

/** The shortcuts bound here under their rows' ids (keyboard-shortcuts.md "Comments and footnotes"). */
export const MOVE_TO_NEXT_SUGGESTION = 'move-to-next-suggestion';
export const MOVE_TO_PREVIOUS_SUGGESTION = 'move-to-previous-suggestion';
export const SUGGESTION_KEY_ACTIONS: readonly string[] = [
  MOVE_TO_NEXT_SUGGESTION,
  MOVE_TO_PREVIOUS_SUGGESTION,
];

/** Brings a position's line into the middle of the view. */
function scrollToPos(view: EditorView, pos: number): void {
  const { node } = view.domAtPos(pos);
  const element = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  element?.scrollIntoView?.({ block: 'center' });
}

export function useTextDocumentSuggestionCards({
  view,
  doc: docRef,
  ready,
  rights,
  subscribe,
  onSelect,
  tab = null,
  showTab,
  onSettled,
  say,
  textWidth,
}: {
  /** The body's editor: suggestions are in the body alone. */
  view: EditorView | null;
  doc: RefObject<Y.Doc | null>;
  ready: boolean;
  rights: SuggestionRights;
  /** Told when the writing changed. */
  subscribe: (listener: () => void) => () => void;
  /** A suggestion was selected: a selected comment thread is let go. */
  onSelect?: () => void;
  /** The document tab shown, and how another is shown. */
  tab?: string | null;
  showTab?: (id: string) => void;
  /** A suggestion was accepted or rejected here: its tied threads are resolved. */
  onSettled?: (id: string) => void;
  /** Says a line in the status line. */
  say?: (text: string) => void;
  /** The text's width in points: a table a column accepted makes wider is fitted to it (review.md "Rows and columns"). */
  textWidth?: number;
}) {
  const [cards, setCards] = useState<readonly SuggestionCard[]>([]);
  const [chosen, setChosen] = useState<string | null>(null);
  const setSelected = useCallback(
    (id: string | null) => {
      if (id !== null) onSelect?.();
      setChosen(id);
    },
    [onSelect],
  );
  const [focusRequest, setFocusRequest] = useState<CardFocusRequest | null>(null);

  useEffect(() => {
    if (!view) return;
    const read = () => {
      if (!view.isDestroyed) setCards(suggestionCards(view.state.doc));
    };
    read();
    return subscribe(read);
  }, [view, subscribe]);

  // A selected suggestion that is gone (settled, by anyone) is let go.
  const selected = chosen !== null && cards.some((c) => c.id === chosen) ? chosen : null;

  const settle = useCallback(
    (id: string, accept: boolean) => {
      const doc = ready ? docRef.current : null;
      const card = cards.find((c) => c.id === id);
      if (!doc || !card) return;
      const offers = cardOffers(card, rights);
      if (accept ? !offers.accept : !offers.reject) return;
      const done = accept
        ? LiveSuggestions.accept(
            doc,
            id,
            TEXT_DOCUMENT_SUGGESTIONS_ORIGIN,
            textWidth === undefined ? undefined : { width: textWidth },
          )
        : LiveSuggestions.reject(doc, id, TEXT_DOCUMENT_SUGGESTIONS_ORIGIN);
      debugLog('[text-document] suggestion settled', { suggestion: id, accept, done });
      if (!done) return;
      onSettled?.(id);
      track(
        'Element',
        'Changed',
        accept ? 'TextDocumentSuggestionAccepted' : 'TextDocumentSuggestionRejected',
      );
      setChosen((was) => (was === id ? null : was));
    },
    [ready, docRef, cards, rights, onSettled, textWidth],
  );

  const land = useCallback(
    (id: string) => {
      const card = cards.find((c) => c.id === id);
      if (!card || !view || view.isDestroyed) return;
      scrollToPos(view, card.from);
      setSelected(id);
      setFocusRequest((was) => ({ id: `suggestion:${id}`, n: (was?.n ?? 0) + 1 }));
    },
    [cards, view, setSelected],
  );

  // A go waiting for its tab's writing: landed once its card is read, else said gone after GO_FRAMES_MAX frames.
  const [pending, setPending] = useState<{ id: string; tab: string } | null>(null);
  const go = useCallback(
    (id: string, where: string) => {
      debugLog('[text-document] suggestion go', { suggestion: id, tab: where });
      setPending({ id, tab: where });
      if (tab !== null && where !== tab) showTab?.(where);
    },
    [tab, showTab],
  );
  useEffect(() => {
    if (!pending || (tab !== null && pending.tab !== tab)) return;
    let frames = 0;
    let frame = requestAnimationFrame(function wait() {
      frames += 1;
      if (cards.some((c) => c.id === pending.id)) {
        land(pending.id);
        setPending(null);
        return;
      }
      if (frames < GO_FRAMES_MAX) {
        frame = requestAnimationFrame(wait);
        return;
      }
      debugLog('[text-document] suggestion go', { suggestion: pending.id, found: false });
      say?.(SUGGESTION_GONE);
      setPending(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [pending, tab, cards, land, say]);

  const step = useCallback(
    (forward: boolean) => {
      if (!view || view.isDestroyed) return;
      const id = suggestionBeside(cards, selected, view.state.selection.from, forward);
      debugLog('[text-document] suggestion step', { forward, suggestion: id });
      if (id) land(id);
    },
    [view, cards, selected, land],
  );

  const exit = useCallback(() => {
    setChosen(null);
    if (view && !view.isDestroyed) view.focus();
  }, [view]);

  const actions: OfficeActions = useMemo(
    () =>
      cards.length === 0
        ? {}
        : {
            [MOVE_TO_NEXT_SUGGESTION]: { run: () => step(true) },
            [MOVE_TO_PREVIOUS_SUGGESTION]: { run: () => step(false) },
          },
    [cards.length, step],
  );

  return {
    cards,
    selected,
    select: setSelected,
    offers: (card: SuggestionCard) => cardOffers(card, rights),
    accept: (id: string) => settle(id, true),
    reject: (id: string) => settle(id, false),
    step,
    exit,
    go,
    focusRequest,
    actions,
  };
}

export type TextDocumentSuggestionCards = ReturnType<typeof useTextDocumentSuggestionCards>;
