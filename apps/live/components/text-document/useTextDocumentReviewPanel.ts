// Tools > Review suggested edits (docs/specs/034-text-documents/review.md "Reviewing suggestions"): the Suggested edits
// panel's state: open or closed, the whole document's count and each tab's, Previous and Next on through the tabs, and
// Accept all and Reject all (a Participant's Reject all mine), each one change of the writing.
import { useCallback, useEffect, useMemo, useState, type RefObject } from 'react';
import type { EditorView } from 'prosemirror-view';
import type * as Y from 'yjs';
import { LiveSuggestions, type TextDocumentSuggestion } from '@livedoc/text-documents';
import { debugLog } from '@/lib/debug-log';
import { track } from '@/lib/telemetry';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import {
  reviewCount,
  reviewStepTarget,
  type ReviewCount,
} from '@/lib/text-document/text-document-review';
import {
  suggestionBeside,
  type SuggestionCard,
  type SuggestionRights,
} from '@/lib/text-document/text-document-suggestion-cards';
import { TEXT_DOCUMENT_SUGGESTIONS_ORIGIN } from '@/lib/text-document/text-document-undo';
import type { ReviewPreview } from './useTextDocumentReviewPreview';

/** The Tools item and shortcut that open and close the panel. */
export const REVIEW_SUGGESTED_EDITS = 'review-suggested-edits';

/** What the panel offers: Accept all, and Reject all (an Editor's) or Reject all mine (a Participant's), or neither. */
export type ReviewOffers = { readonly accept: boolean; readonly reject: 'all' | 'mine' | null };

export function useTextDocumentReviewPanel({
  doc: docRef,
  ready,
  view,
  tab,
  tabs,
  rights,
  cards,
  subscribe,
  preview,
  textWidth,
}: {
  doc: RefObject<Y.Doc | null>;
  ready: boolean;
  view: EditorView | null;
  /** The document tab shown, and every tab in the outline's order. */
  tab: string;
  tabs: readonly { readonly id: string; readonly name: string }[];
  rights: SuggestionRights;
  /** The shown tab's suggestion cards, and going to one in any tab. */
  cards: {
    readonly cards: readonly SuggestionCard[];
    readonly selected: string | null;
    readonly go: (id: string, tab: string) => void;
    readonly select: (id: string | null) => void;
  };
  /** Told when the writing changed. */
  subscribe: (listener: () => void) => () => void;
  preview: {
    readonly mode: ReviewPreview;
    readonly setMode: (mode: ReviewPreview) => void;
    readonly previewing: boolean;
  };
  /** The text's width in points: a table Accept all widens is fitted to it. */
  textWidth?: number;
}) {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<readonly TextDocumentSuggestion[]>([]);
  useEffect(() => {
    const read = () => {
      const doc = ready ? docRef.current : null;
      setList(doc ? LiveSuggestions.read(doc) : []);
    };
    read();
    return subscribe(read);
  }, [ready, docRef, subscribe]);

  const count: ReviewCount = useMemo(() => reviewCount(list, tabs), [list, tabs]);
  const own =
    rights.ownKey === null ? 0 : list.filter((s) => s.author.key === rights.ownKey).length;
  const offers: ReviewOffers = {
    accept: rights.accepts,
    reject: rights.accepts ? 'all' : own > 0 ? 'mine' : null,
  };

  const { setMode } = preview;
  const close = useCallback(() => {
    setOpen(false);
    setMode('show');
  }, [setMode]);
  // Closed from the panel itself: the writing takes the keyboard back.
  const closeToWriting = () => {
    close();
    if (view && !view.isDestroyed) view.focus();
  };
  const toggle = useCallback(() => (open ? close() : setOpen(true)), [open, close]);

  const step = useCallback(
    (forward: boolean) => {
      if (preview.previewing || !view || view.isDestroyed) return;
      const local = suggestionBeside(
        cards.cards,
        cards.selected,
        view.state.selection.from,
        forward,
      );
      const target = reviewStepTarget(
        list,
        tabs.map((t) => t.id),
        tab,
        local,
        forward,
      );
      debugLog('[text-document] review step', { forward, suggestion: target?.id ?? null });
      if (target) cards.go(target.id, target.tab);
    },
    [preview.previewing, view, cards, list, tabs, tab],
  );

  const settleAll = (accept: boolean) => {
    const doc = ready ? docRef.current : null;
    if (!doc || (accept ? !offers.accept : offers.reject === null)) return;
    const settled = LiveSuggestions.settleAll(doc, accept, TEXT_DOCUMENT_SUGGESTIONS_ORIGIN, {
      ...(offers.reject === 'mine' && !accept ? { only: rights.ownKey! } : {}),
      ...(accept && textWidth !== undefined ? { fit: { width: textWidth } } : {}),
    });
    debugLog('[text-document] suggestions settled all', {
      accept,
      settled,
      mine: offers.reject === 'mine',
    });
    if (settled === 0) return;
    cards.select(null);
    setList(LiveSuggestions.read(doc));
    track(
      'Element',
      'Changed',
      accept ? 'TextDocumentSuggestionAcceptedAll' : 'TextDocumentSuggestionRejectedAll',
    );
  };

  const actions: OfficeActions = useMemo(
    () => ({ [REVIEW_SUGGESTED_EDITS]: { run: toggle } }),
    [toggle],
  );

  return {
    open,
    close,
    toggle,
    count,
    offers,
    step,
    acceptAll: () => settleAll(true),
    rejectAll: () => settleAll(false),
    actions,
    /** The panel's props, as TextDocumentReviewPanel takes them. */
    props: {
      count,
      offers,
      mode: preview.mode,
      onMode: setMode,
      onStep: step,
      onAcceptAll: () => settleAll(true),
      onRejectAll: () => settleAll(false),
      onClose: closeToWriting,
    },
  };
}
