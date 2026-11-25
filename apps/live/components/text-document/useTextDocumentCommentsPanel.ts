'use client';

// The comments panel's side of a text document (docs/specs/034-text-documents/review.md "The comments panel"): its
// rows, read again as the threads or the writing change while it is open (a stretch whose text goes reads "Original
// content deleted"), its tab list, and its filters, kept while the document is open even as the panel closes.
import { useEffect, useMemo, useState, type RefObject } from 'react';
import type * as Y from 'yjs';
import type { DocumentTab, TextDocumentThread } from '@livedoc/text-documents';
import { ReviewFilters, type ReviewThreadRow } from '@/lib/office/review/comment-filters';
import { commentRows, tabGroups } from '@/lib/text-document/text-document-comment-rows';

const NO_ROWS: readonly ReviewThreadRow[] = [];

export function useTextDocumentCommentsPanel({
  open,
  doc: docRef,
  ready,
  threads,
  tabs,
  subscribe,
}: {
  /** The panel is open: only then are its rows kept up. */
  open: boolean;
  doc: RefObject<Y.Doc | null>;
  ready: boolean;
  threads: readonly TextDocumentThread[];
  tabs: readonly DocumentTab[];
  /** Told when the writing changed. */
  subscribe: (listener: () => void) => () => void;
}) {
  const [filters, setFilters] = useState<ReviewFilters>(ReviewFilters.initial);
  const [rows, setRows] = useState<readonly ReviewThreadRow[]>(NO_ROWS);

  useEffect(() => {
    const doc = open && ready ? docRef.current : null;
    if (!doc) return;
    let frame = 0;
    const build = () => setRows(commentRows(doc, threads, tabs));
    build();
    // Typing reads them again once a frame at most.
    const soon = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(build);
    };
    const off = subscribe(soon);
    return () => {
      off();
      cancelAnimationFrame(frame);
    };
  }, [open, ready, docRef, threads, tabs, subscribe]);

  const groups = useMemo(() => tabGroups(tabs), [tabs]);
  return { rows: open ? rows : NO_ROWS, groups, filters, setFilters };
}

export type TextDocumentCommentsPanel = ReturnType<typeof useTextDocumentCommentsPanel>;
