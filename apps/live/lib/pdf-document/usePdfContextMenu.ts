'use client';

// What the context menu on a PDF's pages acts on (docs/specs/035-pdf-documents/reading-surface.md "The pages": The
// context menu): the shell's source for it, and the binding of Find "…", only while there is selected text to find.
// Its mark items (Highlight, Underline, Strikethrough) are the mark tools' (usePdfMarkTools.ts).
import { useMemo } from 'react';
import type { OfficeContextMenuSource } from '@/components/office/OfficeContextMenu';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import { FIND_SELECTION, PDF_PAGE_CONTEXT_MENU, findSelectionLabel } from './pdf-context-menu';
import type { PdfTextSelected } from './usePdfTextSelection';

/** Where the menu opens from the keyboard: the selection's first rectangle, or the middle of the pages. */
export function pdfMenuPoint(pages: HTMLElement | null): { x: number; y: number } | null {
  const drawn = pages?.querySelector('[data-pdf-text-selection] polygon');
  if (drawn) {
    const box = drawn.getBoundingClientRect();
    return { x: box.left, y: box.bottom };
  }
  if (!pages) return null;
  const box = pages.getBoundingClientRect();
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
}

export function usePdfContextMenu({
  pages,
  selected,
  onFind,
}: {
  pages: HTMLElement | null;
  selected: PdfTextSelected | null;
  onFind: (query: string) => void;
}) {
  const source = useMemo<OfficeContextMenuSource>(
    () => ({
      entries: PDF_PAGE_CONTEXT_MENU,
      caretPoint: () => pdfMenuPoint(pages),
      // A right-click keeps the selection where it is: the menu acts on it.
      placeCaret: () => {},
    }),
    [pages],
  );
  const actions = useMemo<OfficeActions>(
    () =>
      selected
        ? {
            [FIND_SELECTION]: {
              run: () => onFind(selected.text.replace(/\s+/gu, ' ').trim()),
              label: findSelectionLabel(selected.text),
            },
          }
        : {},
    [selected, onFind],
  );
  return { source, actions };
}
