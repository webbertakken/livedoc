'use client';

// The text of a PDF's pages as a person reads it (docs/specs/035-pdf-documents/reading-surface.md "The pages":
// Selecting text, Copy, Previous view, The context menu; "Find"): the selection, Copy and Select all, Find, the
// page's context menu, and the keys that reach them outside a field. Composed by the surface, which hands it the view.
import { useCallback, useMemo, type KeyboardEvent } from 'react';
import type {
  LinkTarget,
  PageInfo,
  PageTurns,
  PdfEngine,
  TextSelection,
} from '@livedoc/pdf-documents';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import { FIND } from './pdf-menus';
import { usePdfContextMenu } from './usePdfContextMenu';
import { usePdfFind } from './usePdfFind';
import { usePdfTextActions } from './usePdfTextActions';
import { usePdfTextSelection } from './usePdfTextSelection';
import type { PdfSpot } from './usePdfView';

type Engine = Pick<PdfEngine, 'pageText' | 'fileMarks' | 'outline' | 'pageMatrix'>;

export function usePdfReadingText({
  engine,
  pages,
  page,
  turns,
  pagesElement,
  mayCopy,
  marking,
  jump,
  follow,
  step,
  onHighlight,
  onProblem,
}: {
  engine: Engine | null;
  // The pages read; null before the PDF is open.
  pages: readonly PageInfo[] | null;
  // The page in view: Select all's.
  page: number;
  turns: PageTurns;
  pagesElement: HTMLElement | null;
  // Whether the file's permissions allow copying.
  mayCopy: boolean;
  // Whether a mark may be made now.
  marking: boolean;
  jump: (index: number, at?: PdfSpot) => void;
  follow: (target: LinkTarget | null) => void;
  // Previous view and Next view; false with nowhere to go.
  step: (way: 'back' | 'forward') => boolean;
  onHighlight: (page: number, selection: TextSelection) => void;
  onProblem: (problem: string) => void;
}) {
  const selection = usePdfTextSelection(engine, pages);
  const text = usePdfTextActions({
    selected: selection.selected,
    selectAll: selection.selectAll,
    page,
    mayCopy,
    onProblem,
  });
  const find = usePdfFind({ engine, pages: pages ?? [], turns, jump, follow });
  const { ask, actions: findActions } = find;
  const findSelection = useCallback(
    (query: string) => {
      findActions[FIND]?.run();
      ask(query);
    },
    [findActions, ask],
  );
  const contextMenu = usePdfContextMenu({
    pages: pagesElement,
    selected: selection.selected,
    marking,
    onHighlight,
    onFind: findSelection,
    clear: selection.clear,
  });
  const actions = useMemo<OfficeActions>(
    () => ({ ...text.actions, ...find.actions, ...contextMenu.actions }),
    [text.actions, find.actions, contextMenu.actions],
  );

  /** The keys it hears outside a field: ⌘A on the pages, ⌘C, ⌥← and ⌥→, Escape; true where one was taken. */
  const onKey = (event: KeyboardEvent<HTMLElement>): boolean => {
    const key = event.key.toLowerCase();
    const command = (event.ctrlKey || event.metaKey) && !event.altKey;
    // ⌘A on the pages selects the page in view's text; elsewhere it is the browser's.
    if (pages && command && key === 'a' && event.target === pagesElement) {
      event.preventDefault();
      selection.selectAll(page);
      return true;
    }
    // ⌘C copies the text selected on the pages; with none selected it is the browser's.
    if (command && !event.shiftKey && key === 'c' && text.copyKey()) {
      event.preventDefault();
      return true;
    }
    // ⌥← and ⌥→: Previous view and Next view; with nowhere to go the keys stay the browser's.
    const alone = !event.ctrlKey && !event.metaKey && !event.shiftKey;
    if (event.altKey && alone && (key === 'arrowleft' || key === 'arrowright')) {
      if (step(key === 'arrowleft' ? 'back' : 'forward')) event.preventDefault();
      return true;
    }
    // Escape clears the selection, and goes on to the tools.
    if (key === 'escape' && !event.altKey && selection.selected) selection.clear();
    return false;
  };

  return { selection, find, contextMenu: contextMenu.source, actions, onKey };
}
