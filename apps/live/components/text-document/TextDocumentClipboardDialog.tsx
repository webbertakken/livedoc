'use client';

// Copying and pasting (docs/specs/034-text-documents/text-and-paragraphs.md "Clipboard"): shown when the browser
// refuses Edit > Cut, Copy or Paste the clipboard, as Google's is; it names the keys that still reach it.
import { useMemo } from 'react';
import { OfficeDialog } from '@/components/office/OfficeDialog';
import { currentOfficePlatform } from '@/lib/office/office-platform';
import { shortcutTextOf } from '@/lib/office/shortcut-notation';
import { TEXT_DOCUMENT_SHORTCUTS } from '@/lib/text-document/text-document-shortcuts';

const ROWS = [
  ['copy', 'for copy'],
  ['cut', 'for cut'],
  ['paste', 'for paste'],
  ['paste-without-formatting', 'for paste without formatting'],
] as const;

export function TextDocumentClipboardDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const keys = useMemo(() => shortcutTextOf(TEXT_DOCUMENT_SHORTCUTS, currentOfficePlatform()), []);
  return (
    <OfficeDialog open={open} onClose={onClose} title="Copying and pasting">
      <p className="text-body">
        This browser does not let the Edit menu reach the clipboard. These keys still do:
      </p>
      <ul className="mt-3 flex flex-col gap-2 text-body">
        {ROWS.map(([id, label]) => {
          const text = keys(id);
          return text ? (
            <li key={id} className="flex gap-3">
              <kbd aria-label={text.aria} className="min-w-24 font-sans">
                {text.shown}
              </kbd>
              <span>{label}</span>
            </li>
          ) : null;
        })}
      </ul>
    </OfficeDialog>
  );
}
