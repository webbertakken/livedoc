'use client';

// Tools > Compare documents (docs/specs/034-text-documents/review.md "The dialog"): the item, offered to everyone who
// reads the document, opens the dialog; in This Browser it is dimmed and says why. The comparison is made from the
// writing as it is now and opened in a new browser tab.
import { useCallback, useMemo, useState, type ReactNode, type RefObject } from 'react';
import type * as Y from 'yjs';
import type { TextDocumentFormat } from '@livedoc/document';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import { makeComparison, type CompareOutcome } from '@/lib/text-document/text-document-compare';
import { TextDocumentCompareDialog, type CompareChoice } from './TextDocumentCompareDialog';

/** The Tools item. */
export const COMPARE_DOCUMENTS = 'compare-documents';
/** What a dimmed Compare documents says in This Browser (review.md "The dialog", (default)). */
export const COMPARE_LOCAL_NOTE = 'LiveDoc only';
export const COMPARE_LOCAL_HINT = 'Comparing needs a document stored in LiveDoc.';

export function useTextDocumentCompare({
  ownerId,
  documentId,
  documentName,
  format,
  liveDoc,
  local,
  defaultName,
  open: openTab = (documentId) => window.open(`/document/${documentId}`, '_blank', 'noopener'),
}: {
  ownerId: string;
  documentId: string;
  documentName: string;
  format: TextDocumentFormat;
  /** The writing as it is now. */
  liveDoc: RefObject<Y.Doc | null>;
  /** A document in This Browser, which has nothing to compare against. */
  local: boolean;
  /** The person's commenting name, the attribution's first value. */
  defaultName: string;
  /** Shows a document in a new browser tab. */
  open?: (documentId: string) => void;
}): { actions: OfficeActions; dialog: ReactNode } {
  const [shown, setShown] = useState(false);
  const actions = useMemo<OfficeActions>(
    () => ({
      [COMPARE_DOCUMENTS]: local
        ? { run: () => {}, disabled: true, note: COMPARE_LOCAL_NOTE, hint: COMPARE_LOCAL_HINT }
        : { run: () => setShown(true) },
    }),
    [local],
  );
  const compare = useCallback(
    async (choice: CompareChoice): Promise<CompareOutcome> => {
      const doc = liveDoc.current;
      if (!doc) return { ok: false, refusal: 'unreadable' };
      return makeComparison({
        ownerId,
        primary: { documentId, name: documentName, format, doc },
        selected: choice.selected,
        name: choice.name,
        comments: choice.comments,
        at: Date.now(),
      });
    },
    [ownerId, documentId, documentName, format, liveDoc],
  );
  const dialog = shown ? (
    <TextDocumentCompareDialog
      ownerId={ownerId}
      currentId={documentId}
      documentName={documentName}
      defaultName={defaultName}
      onCompare={compare}
      onOpen={openTab}
      onClose={() => setShown(false)}
    />
  ) : null;
  return { actions, dialog };
}
