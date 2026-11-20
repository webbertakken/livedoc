'use client';

// The surface's side of the clipboard (docs/specs/034-text-documents/text-and-paragraphs.md "Clipboard"): Edit > Cut,
// Copy, Paste and Paste without formatting, the Copying and pasting dialog when the browser refuses them, and the note
// that a paste left content kept from another file out.
import { useEffect, useMemo, useState } from 'react';
import type { EditorView } from 'prosemirror-view';
import { clipboardActions } from '@/lib/text-document/text-document-clipboard';
import { TextDocumentClipboardDialog } from './TextDocumentClipboardDialog';

/** How long the note that a paste left kept content out stays (default). */
export const PASTE_NOTICE_MS = 10_000;

export const leftOutNotice = (count: number) =>
  `Content kept from the other file was left out (${count} ${count === 1 ? 'item' : 'items'}).`;

export function useTextDocumentClipboard(view: EditorView | null, canEdit: boolean) {
  const [leftOut, setLeftOut] = useState<number | null>(null);
  const [refused, setRefused] = useState(false);
  useEffect(() => {
    if (leftOut === null) return;
    const timer = window.setTimeout(() => setLeftOut(null), PASTE_NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [leftOut]);
  const actions = useMemo(
    () => clipboardActions(view, { canEdit, onRefused: () => setRefused(true) }),
    [view, canEdit],
  );
  const dialog = (
    <TextDocumentClipboardDialog
      open={refused}
      onClose={() => {
        setRefused(false);
        view?.focus();
      }}
    />
  );
  const notice =
    leftOut !== null ? (
      <p
        role="status"
        className="border-b border-(--office-line) bg-(--office-chrome) px-4 py-2 text-center text-sm text-(--office-ink)"
      >
        {leftOutNotice(leftOut)}
      </p>
    ) : null;
  return { actions, dialog, notice, onLeftOut: setLeftOut };
}
