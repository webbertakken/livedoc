'use client';

// What the context menu on a PDF's pages acts on (docs/specs/035-pdf-documents/reading-surface.md "The pages": The
// context menu): the shell's source for it, and the bindings of its own two items, Highlight and Find "…", each only
// while there is selected text to act on.
import { useMemo } from 'react';
import type { TextSelection } from '@livedoc/pdf-documents';
import type { OfficeContextMenuSource } from '@/components/office/OfficeContextMenu';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import {
  FIND_SELECTION,
  HIGHLIGHT_SELECTION,
  PDF_PAGE_CONTEXT_MENU,
  findSelectionLabel,
} from './pdf-context-menu';
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
  marking,
  onHighlight,
  onFind,
  clear,
}: {
  pages: HTMLElement | null;
  selected: PdfTextSelected | null;
  // Whether a mark may be made now: Reviewing, for a session that reviews.
  marking: boolean;
  onHighlight: (page: number, selection: TextSelection) => void;
  onFind: (query: string) => void;
  clear: () => void;
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
            ...(marking
              ? {
                  [HIGHLIGHT_SELECTION]: {
                    run: () => {
                      onHighlight(selected.page, { text: selected.text, quads: selected.quads });
                      clear();
                    },
                  },
                }
              : {}),
          }
        : {},
    [selected, marking, onHighlight, onFind, clear],
  );
  return { source, actions };
}
