'use client';

// A text document's review in the editor (docs/specs/034-text-documents/review.md): the comment threads in the margin
// and the keys between them, an Inbox row's arrival, the comments panel's rows, and the suggestion cards beside the
// threads, with one card selected at a time, and the Suggested edits panel. Composed once here so the surface wires
// review with one call.
import { useCallback, useEffect, useMemo, type RefObject } from 'react';
import type { EditorView } from 'prosemirror-view';
import type * as Y from 'yjs';
import type { CommentMention } from '@livedoc/document';
import type { DocumentTab } from '@livedoc/text-documents';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import type { OfficeCommenter } from '@/lib/office/review/office-commenter';
import type { SuggestionRights } from '@/lib/text-document/text-document-suggestion-cards';
import { useTextDocumentThreads } from './useTextDocumentThreads';
import { useTextDocumentThreadKeys } from './useTextDocumentThreadKeys';
import {
  useTextDocumentThreadArrival,
  type TextDocumentThreadArrival,
} from './useTextDocumentThreadArrival';
import { useTextDocumentCommentsPanel } from './useTextDocumentCommentsPanel';
import {
  useTextDocumentSuggestionCards,
  type SuggestionStories,
} from './useTextDocumentSuggestionCards';
import { useTextDocumentReviewPanel } from './useTextDocumentReviewPanel';
import type { ReviewPreview } from './useTextDocumentReviewPreview';
import { SUGGESTION_ROW } from '@/lib/text-document/text-document-comment-rows';

export function useTextDocumentReview({
  view,
  activeView,
  doc,
  ready,
  tab,
  tabs,
  showTab,
  commenter,
  rights,
  panelOpen,
  arrival,
  subscribe,
  onMentioned,
  onAssigned,
  textWidth,
  preview,
  stories = null,
  shown = true,
}: {
  /** The body's editor, and the editor with the caret. */
  view: EditorView | null;
  activeView: EditorView | null;
  doc: RefObject<Y.Doc | null>;
  ready: boolean;
  /** The document tab shown, the document's tabs, and how another is shown. */
  tab: string;
  tabs: readonly DocumentTab[];
  showTab: (id: string) => void;
  commenter: OfficeCommenter | null;
  /** Who may accept and reject suggestions here (review.md "Suggestion cards"). */
  rights: SuggestionRights;
  /** The comments panel is open. */
  panelOpen: boolean;
  /** The thread an Inbox row asked to go to. */
  arrival: TextDocumentThreadArrival | null;
  /** Told when the writing changed. */
  subscribe: (listener: () => void) => () => void;
  onMentioned?: (text: string, mentions: readonly CommentMention[]) => void;
  onAssigned?: (text: string, assignee: CommentMention) => void;
  /** The text's width in points, a table a column accepted makes wider fitted to it. */
  textWidth?: number;
  /** The Suggested edits panel's preview of the body. */
  preview: {
    readonly mode: ReviewPreview;
    readonly setMode: (mode: ReviewPreview) => void;
    readonly previewing: boolean;
  };
  /** The headers, footers and notes drawn, whose suggestions have cards too; none while previewing. */
  stories?: SuggestionStories | null;
  /**
   * Comments and suggestions are shown: false in Viewing (review.md "Editing modes"), where no thread, card or review
   * panel is drawn or offered; a panel left open is open again on leaving it.
   */
  shown?: boolean;
}) {
  // Comment threads in the margin, added on the body's writing (review.md "Threads in the margin").
  const threads = useTextDocumentThreads({
    view,
    activeView,
    doc,
    ready,
    tab,
    commenter,
    subscribe,
    onMentioned,
    onAssigned,
    hidden: !shown,
  });
  // Going to a thread and the keys between them (review.md "The comments panel", "Keys on a selected comment").
  const threadKeys = useTextDocumentThreadKeys({ view, threads, tab, showTab });
  useTextDocumentThreadArrival({ arrival, ready, arrive: threadKeys.arrive });
  // The comments panel's rows and filters (review.md "The comments panel").
  const commentsPanel = useTextDocumentCommentsPanel({
    open: panelOpen,
    doc,
    ready,
    threads: threads.threads,
    tabs,
    subscribe,
  });
  // The suggestions' cards beside the threads' (review.md "Suggestion cards"); one card is selected at a time.
  // Settling one resolves its tied threads (review.md "Suggestion cards", Replies).
  const { select: selectThread, selected: selectedThread, resolveTied, say } = threads;
  const letThreadGo = useCallback(() => selectThread(null), [selectThread]);
  const suggestions = useTextDocumentSuggestionCards({
    view,
    doc,
    ready,
    rights,
    subscribe,
    onSelect: letThreadGo,
    tab,
    showTab,
    onSettled: resolveTied,
    say,
    textWidth,
    stories,
  });
  const { select: selectSuggestion } = suggestions;
  useEffect(() => {
    if (selectedThread !== null) selectSuggestion(null);
  }, [selectedThread, selectSuggestion]);

  const panelTabs = useMemo(() => tabs.map((t) => ({ id: t.id, name: t.name })), [tabs]);
  const panel = useTextDocumentReviewPanel({
    doc,
    ready,
    view,
    tab,
    tabs: panelTabs,
    rights,
    cards: suggestions,
    subscribe,
    preview,
    textWidth,
  });

  const actions: OfficeActions = useMemo(
    () =>
      shown
        ? { ...threads.actions, ...threadKeys.actions, ...suggestions.actions, ...panel.actions }
        : {},
    [shown, threads.actions, threadKeys.actions, suggestions.actions, panel.actions],
  );
  const shownPanel = useMemo(
    () => (shown || !panel.open ? panel : { ...panel, open: false }),
    [shown, panel],
  );

  // A press on a panel's row: a suggestion's goes to its card, on its tab; a thread's to its thread.
  const { rows } = commentsPanel;
  const { go: goToSuggestion } = suggestions;
  const { go: goToThread } = threadKeys;
  const go = useCallback(
    (id: string) => {
      if (!id.startsWith(SUGGESTION_ROW)) return goToThread(id);
      const row = rows.find((r) => r.id === id);
      goToSuggestion(id.slice(SUGGESTION_ROW.length), row?.group ?? tab);
    },
    [rows, tab, goToSuggestion, goToThread],
  );

  return { threads, threadKeys, commentsPanel, suggestions, panel: shownPanel, actions, go };
}
