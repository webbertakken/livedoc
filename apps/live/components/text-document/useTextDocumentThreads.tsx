'use client';

// Comment threads in the editor (docs/specs/034-text-documents/review.md "Threads in the margin", "How a comment is
// kept"): the document's threads read from its live state as they change, each open one's stretch in the writing
// shown, the thread selected and a draft not yet sent; Add comment, and each write (begin, reply, edit, delete,
// resolve) made beside the writing, never an undo step of it. A session with no commenter reads the threads alone.
import { useCallback, useEffect, useMemo, useState, type RefObject } from 'react';
import type { EditorView } from 'prosemirror-view';
import type * as Y from 'yjs';
import { mentionsInText, sanitizeMentions, type CommentMention } from '@livedoc/document';
import {
  LiveThreads,
  THREADS_MAP,
  TEXT_DOCUMENT_THREAD_COMMENTS_MAX,
  TEXT_DOCUMENT_THREADS_MAX,
  type TextDocumentThread,
} from '@livedoc/text-documents';
import { debugLog } from '@/lib/debug-log';
import { track } from '@/lib/telemetry';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import {
  anchorsOf,
  setThreadHighlight,
  stretchToComment,
  threadStretches,
  type ThreadStretch,
} from '@/lib/text-document/text-document-threads';
import type { TextDocumentCommenter } from '@/lib/text-document/text-document-commenter';
import { reactorNames } from '@/lib/office/review/comment-reactions';
import { sharedComment } from '@/lib/text-document/text-document-comment-rows';

/** The menu item, toolbar button and context menu item that add a comment (Insert > Comment, ⌘⌥M). */
export const COMMENT_ITEM = 'comment';

/** The origin the threads' writes carry: beside the writing, so no undo of it tracks them. */
export const THREADS_ORIGIN = 'text-document-threads';

/** What the status line says when Add comment finds nothing to comment on (review.md, (default)). */
export const NOTHING_TO_COMMENT_ON = 'Select some text to comment on';
/** What it says once the document holds the most threads, or a thread the most comments. */
export const COMMENTS_FULL = 'This document holds the most comments it can';

/** A draft: the stretch Add comment took, kept by its anchors until it is sent or dropped. */
export type ThreadDraft = {
  readonly from: number;
  readonly to: number;
  readonly start: Uint8Array;
  readonly end: Uint8Array;
  readonly quote: string;
};

export function useTextDocumentThreads({
  view,
  activeView,
  doc: docRef,
  ready,
  tab,
  commenter,
  subscribe,
  onMentioned,
}: {
  /** The body's editor: comments are on the body alone. */
  view: EditorView | null;
  /** The editor with the caret (the body, a header, a footer or a note). */
  activeView: EditorView | null;
  /** The live state, read once the surface is ready. */
  doc: RefObject<Y.Doc | null>;
  ready: boolean;
  /** The document tab shown. */
  tab: string;
  commenter: TextDocumentCommenter | null;
  /** Told when the writing changed. */
  subscribe: (listener: () => void) => () => void;
  /** A draft or reply with mentions was added: count it and ask for the email (review.md "Mentions"). */
  onMentioned?: (text: string, mentions: readonly CommentMention[]) => void;
}) {
  const [threads, setThreads] = useState<readonly TextDocumentThread[]>([]);
  const [stretches, setStretches] = useState<readonly ThreadStretch[]>([]);
  const [chosen, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<ThreadDraft | null>(null);
  const [said, setSaid] = useState('');

  // The threads, read again whenever any of them changes, by anyone.
  useEffect(() => {
    const doc = ready ? docRef.current : null;
    if (!doc) return;
    const map = doc.getMap(THREADS_MAP);
    const read = () => setThreads(LiveThreads.read(doc));
    read();
    map.observeDeep(read);
    return () => map.unobserveDeep(read);
  }, [ready, docRef]);

  // Each open thread's stretch, found again as the writing or the threads change.
  useEffect(() => {
    if (!view) return;
    const find = () => {
      if (view.isDestroyed) return;
      setStretches(threadStretches(view.state, threads));
    };
    find();
    return subscribe(find);
  }, [view, threads, subscribe]);

  // A selected thread that is gone, or resolved, is let go.
  const selected =
    chosen !== null && threads.some((t) => t.id === chosen && !t.resolved) ? chosen : null;

  // The highlight shows what is held here.
  useEffect(() => {
    if (view && !view.isDestroyed)
      setThreadHighlight(view, {
        stretches,
        selected,
        draft: draft && { from: draft.from, to: draft.to },
      });
  }, [view, stretches, selected, draft]);

  const say = useCallback((text: string) => {
    setSaid(text);
    debugLog('[text-document] thread refused', { reason: text });
  }, []);

  const addComment = useCallback(() => {
    if (!view || view.isDestroyed || !commenter) return;
    const stretch = activeView === view ? stretchToComment(view.state) : null;
    const anchors = stretch && anchorsOf(view.state, stretch.from, stretch.to);
    if (!stretch || !anchors) return say(NOTHING_TO_COMMENT_ON);
    if (threads.length >= TEXT_DOCUMENT_THREADS_MAX) return say(COMMENTS_FULL);
    setSelected(null);
    setDraft({ ...stretch, ...anchors });
    debugLog('[text-document] thread draft opened', { from: stretch.from, to: stretch.to });
  }, [view, activeView, commenter, threads.length, say]);

  const comment = useCallback(
    (text: string, mentions: readonly CommentMention[]) => ({
      id: crypto.randomUUID(),
      text,
      at: Date.now(),
      author: { key: commenter!.key, name: commenter!.name, colour: commenter!.colour },
      ...(mentions.length ? { mentions } : {}),
    }),
    [commenter],
  );

  // Once a comment with mentions is added: counted, and those it names emailed (never on an edit).
  const mentioned = useCallback(
    (text: string, mentions: readonly CommentMention[]) => {
      if (mentions.length) onMentioned?.(text, mentions);
    },
    [onMentioned],
  );

  const send = useCallback(
    (text: string, mentions: readonly CommentMention[] = []) => {
      const doc = ready ? docRef.current : null;
      if (!doc || !draft || !commenter) return;
      const id = crypto.randomUUID();
      const begun = LiveThreads.begin(
        doc,
        {
          id,
          tab,
          start: draft.start,
          end: draft.end,
          quote: draft.quote,
          comment: comment(text, mentions),
        },
        THREADS_ORIGIN,
      );
      setDraft(null);
      if (!begun) return;
      setSelected(id);
      track('Comment', 'Added', 'TextDocument');
      mentioned(text, mentions);
      debugLog('[text-document] thread begun', { thread: id, mentions: mentions.length });
    },
    [ready, docRef, draft, commenter, tab, comment, mentioned],
  );

  const cancel = useCallback(() => {
    setDraft(null);
    if (view && !view.isDestroyed) view.focus();
  }, [view]);

  const reply = useCallback(
    (threadId: string, text: string, mentions: readonly CommentMention[] = []) => {
      const doc = ready ? docRef.current : null;
      if (!doc || !commenter) return;
      const thread = threads.find((t) => t.id === threadId);
      if (thread && thread.comments.length >= TEXT_DOCUMENT_THREAD_COMMENTS_MAX)
        return say(COMMENTS_FULL);
      if (!LiveThreads.reply(doc, threadId, comment(text, mentions), THREADS_ORIGIN)) return;
      track('Comment', 'Added', 'TextDocument');
      mentioned(text, mentions);
      debugLog('[text-document] thread replied', { thread: threadId, mentions: mentions.length });
    },
    [ready, docRef, commenter, comment, threads, say, mentioned],
  );

  const edit = useCallback(
    (threadId: string, commentId: string, text: string) => {
      const doc = ready ? docRef.current : null;
      if (!doc || !commenter) return;
      // An edit keeps the mentions whose handle is still in its text, and adds none.
      const held = threads
        .find((t) => t.id === threadId)
        ?.comments.find((c) => c.id === commentId)?.mentions;
      const kept = held ? mentionsInText(text, sanitizeMentions(held) ?? []) : undefined;
      const done = LiveThreads.edit(
        doc,
        threadId,
        commentId,
        text,
        Date.now(),
        THREADS_ORIGIN,
        kept,
      );
      debugLog('[text-document] comment edited', {
        thread: threadId,
        done,
        mentions: kept?.length,
      });
    },
    [ready, docRef, commenter, threads],
  );

  const remove = useCallback(
    (threadId: string, commentId: string) => {
      const doc = ready ? docRef.current : null;
      if (!doc || !commenter) return;
      const done = LiveThreads.remove(doc, threadId, commentId, THREADS_ORIGIN);
      debugLog('[text-document] comment deleted', { thread: threadId, done });
    },
    [ready, docRef, commenter],
  );

  const resolve = useCallback(
    (threadId: string, resolved: boolean) => {
      const doc = ready ? docRef.current : null;
      if (!doc || !commenter) return;
      if (!LiveThreads.resolve(doc, threadId, resolved, THREADS_ORIGIN)) return;
      if (resolved) {
        setSelected((was) => (was === threadId ? null : was));
        track('Comment', 'Resolved', 'TextDocument');
      }
      debugLog('[text-document] thread resolved', { thread: threadId, resolved });
    },
    [ready, docRef, commenter],
  );

  const react = useCallback(
    (threadId: string, commentId: string, emoji: string, on: boolean) => {
      const doc = ready ? docRef.current : null;
      if (!doc || !commenter) return;
      const done = LiveThreads.react(
        doc,
        threadId,
        commentId,
        { emoji, key: commenter.key, on },
        THREADS_ORIGIN,
      );
      if (done && on) track('Comment', 'Added', 'TextDocumentReaction');
      debugLog('[text-document] comment reacted', { thread: threadId, on, done });
    },
    [ready, docRef, commenter],
  );

  // Who reacted, by key: each author's latest name in this document (review.md "Reactions").
  const names = useMemo(
    () => reactorNames(threads.flatMap((t) => t.comments.map(sharedComment))),
    [threads],
  );

  const actions: OfficeActions = useMemo(
    () => (commenter ? { [COMMENT_ITEM]: { run: addComment } } : {}),
    [commenter, addComment],
  );

  const status = (
    <p role="status" className="sr-only">
      {said}
    </p>
  );

  return {
    threads,
    stretches,
    selected,
    select: setSelected,
    draft,
    addComment,
    send,
    cancel,
    reply,
    edit,
    remove,
    resolve,
    react,
    names,
    actions,
    status,
    say,
  };
}

export type TextDocumentThreads = ReturnType<typeof useTextDocumentThreads>;
