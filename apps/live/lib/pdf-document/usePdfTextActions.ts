'use client';

// Edit > Copy and Select all on a PDF's pages (docs/specs/035-pdf-documents/reading-surface.md "The pages": Copy;
// opening.md "Passwords": a file that asks not to be copied dims Copy with the reason). ⌘C is the browser's copy
// event, heard on the surface so a field keeps its own; the menu's Copy writes the clipboard itself.
import { useCallback, useMemo, type ClipboardEvent } from 'react';
import { debugLog } from '@/lib/debug-log';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import { track } from '@/lib/telemetry';
import { COPY, SELECT_ALL } from './pdf-menus';
import type { PdfTextSelected } from './usePdfTextSelection';

/** Copy's label where the file asks not to be copied. */
export const COPY_NOT_ALLOWED_LABEL = 'Copy (this PDF asks not to be copied)';
/** Said when ⌘C meets a file that asks not to be copied. */
export const COPY_REFUSED_COPY = 'This PDF asks not to be copied.';
/** Said when the browser refuses the clipboard. */
export const COPY_FAILED_COPY = 'The text couldn’t be copied.';

const typesText = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

const copied = (text: string) => {
  debugLog(`[pdf] text-copied chars=${text.length}`);
  track('Pdf', 'Copied', 'Text');
};

export function usePdfTextActions({
  selected,
  selectAll,
  page,
  mayCopy,
  onProblem,
}: {
  selected: PdfTextSelected | null;
  selectAll: (page: number) => void;
  // The page in view: Select all's.
  page: number;
  // Whether the file's permissions allow copying.
  mayCopy: boolean;
  onProblem: (problem: string) => void;
}) {
  const text = selected?.text ?? null;

  const actions = useMemo<OfficeActions>(
    () => ({
      [COPY]: {
        run: () => {
          if (!text || !mayCopy) return;
          navigator.clipboard.writeText(text).then(
            () => copied(text),
            () => {
              debugLog('[pdf] text-copy-failed');
              onProblem(COPY_FAILED_COPY);
            },
          );
        },
        disabled: !text || !mayCopy,
        ...(mayCopy ? {} : { label: COPY_NOT_ALLOWED_LABEL }),
      },
      [SELECT_ALL]: { run: () => selectAll(page) },
    }),
    [text, mayCopy, onProblem, selectAll, page],
  );

  const onCopy = useCallback(
    (event: ClipboardEvent<HTMLElement>) => {
      if (!text || typesText(event.target)) return;
      event.preventDefault();
      if (!mayCopy) {
        debugLog('[pdf] text-copy-refused');
        return onProblem(COPY_REFUSED_COPY);
      }
      event.clipboardData.setData('text/plain', text);
      copied(text);
    },
    [text, mayCopy, onProblem],
  );

  return { actions, onCopy };
}
