'use client';

// The save status's "Last edit was 5 minutes ago by Ada" (docs/specs/034-text-documents/editing-surface.md "The title
// row"): read as the details open, a link that opens version history. Nothing until it is read, and nothing when it
// cannot be.
import { useEffect, useState } from 'react';
import type { TextDocumentLastEditDto } from '@livedoc/api-schema';
import { apiReadTextDocumentLastEdit } from '@/lib/api/text-document-versions';
import type { TextDocumentScope } from '@/lib/api/text-documents';
import { debugLog } from '@/lib/debug-log';
import { lastEditWords } from '@/lib/text-document/text-document-last-edit';

export function TextDocumentLastEdit({
  where,
  onOpen,
  now = Date.now,
}: {
  where: TextDocumentScope;
  /** Opens version history. */
  onOpen: () => void;
  now?: () => number;
}) {
  const [edit, setEdit] = useState<TextDocumentLastEditDto | null>(null);
  const { ownerId, documentId, tabId, shareCode } = where;
  useEffect(() => {
    let live = true;
    apiReadTextDocumentLastEdit({ ownerId, documentId, tabId, shareCode }).then(
      (read) => {
        if (live) setEdit(read);
      },
      (error: unknown) => debugLog('[text-document] last edit unread', { error: String(error) }),
    );
    return () => {
      live = false;
    };
  }, [ownerId, documentId, tabId, shareCode]);
  if (!edit) return null;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="mt-2 text-left text-(--office-primary) underline outline-none hover:no-underline focus-visible:ring-2 focus-visible:ring-(--office-focus)"
    >
      {lastEditWords(edit, now())}
    </button>
  );
}
