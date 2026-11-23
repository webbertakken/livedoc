'use client';

// Edit > Copy and Select all on a PDF's pages (docs/specs/035-pdf-documents/reading-surface.md "The pages": Copy;
// opening.md "Passwords": a file that asks not to be copied dims Copy with the reason). ⌘C is heard by the surface
// outside a field, as a browser sends no copy event where nothing of the page's markup is selected; both write the
// clipboard themselves.
import { useCallback, useMemo } from 'react';
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

  const write = useCallback(
    (copying: string) =>
      navigator.clipboard.writeText(copying).then(
        () => copied(copying),
        () => {
          debugLog('[pdf] text-copy-failed');
          onProblem(COPY_FAILED_COPY);
        },
      ),
    [onProblem],
  );

  const actions = useMemo<OfficeActions>(
    () => ({
      [COPY]: {
        run: () => {
          if (text && mayCopy) void write(text);
        },
        disabled: !text || !mayCopy,
        ...(mayCopy ? {} : { label: COPY_NOT_ALLOWED_LABEL }),
      },
      [SELECT_ALL]: { run: () => selectAll(page) },
    }),
    [text, mayCopy, write, selectAll, page],
  );

  /** ⌘C on the surface, outside a field: copies the selection, or says the file asks not; false with none selected. */
  const copyKey = useCallback((): boolean => {
    if (!text) return false;
    if (mayCopy) void write(text);
    else {
      debugLog('[pdf] text-copy-refused');
      onProblem(COPY_REFUSED_COPY);
    }
    return true;
  }, [text, mayCopy, write, onProblem]);

  return { actions, copyKey };
}
