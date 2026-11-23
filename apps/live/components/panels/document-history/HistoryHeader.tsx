'use client';

// Whose history it is (docs/specs/013-workspace/timeline.md §2.10): the document's thumbnail, its
// name as the dialog's heading and its owner as the Explorer words it. No kind word: a document
// has no kind (docs/specs/003-system-architecture/domain-language.md).

import { DialogCloseButton } from '@livedoc/ui';
import { DocumentThumbnail } from '@/components/panels/DocumentThumbnail';
import { ownerLabelFor } from '@/app/explorer/document-row-shared';
import type { PaneDocument } from '@/app/explorer/views';
import { INSET, MUTED } from './history-styles';

const THUMB_BOX =
  'h-12 w-14 shrink-0 overflow-hidden rounded-control border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800';

export function HistoryHeader({
  titleId,
  ownerId,
  documentId,
  name,
  document,
  onClose,
}: {
  titleId: string;
  ownerId: string;
  documentId: string;
  name: string;
  // The Explorer's row, when it has the document loaded; the owner and thumbnail version come
  // from it.
  document: PaneDocument | undefined;
  onClose: () => void;
}) {
  return (
    <div
      className={`flex shrink-0 items-start gap-3 border-b border-slate-100 pt-5 pb-4 dark:border-slate-800 ${INSET}`}
    >
      <DocumentThumbnail
        ownerId={ownerId}
        documentId={documentId}
        version={document?.savedAt ?? 0}
        shareCode={document?.shared?.shareCode ?? null}
        empty={document?.empty ?? false}
        className={THUMB_BOX}
      />
      <div className="min-w-0 flex-1">
        <p className="text-supporting text-brand-700 dark:text-brand-300">History</p>
        <h2
          id={titleId}
          className="line-clamp-2 text-name break-words text-slate-900 dark:text-slate-100"
        >
          {name}
        </h2>
        {document ? (
          <p className={`mt-0.5 truncate text-supporting ${MUTED}`}>
            <span className="sr-only">Owner: </span>
            {ownerLabelFor(document)}
          </p>
        ) : null}
      </div>
      <div className="-mt-1 flex shrink-0 items-center">
        <DialogCloseButton onClick={onClose} />
      </div>
    </div>
  );
}
