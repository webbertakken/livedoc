'use client';

// Dragging a document tab in the outline (docs/specs/034-text-documents/links-and-navigation.md "A tab's menu",
// Dragging): an Editor drags a tab by its row onto another's, which shows where it would land (a line above or below,
// indented one more for into) only where the drop is allowed; Move up, Move down, Indent and Outdent in the tab's menu
// are the same with a single pointer or the keys.
import { useCallback, useState, type DragEvent } from 'react';
import type { DocumentTabDropPlace } from '@livedoc/text-documents';
import { TAB_DRAG_TYPE, tabDropPlace } from '@/lib/text-document/text-document-tab-drag';
import type { TextDocumentTabs } from './useTextDocumentTabs';

export type TabDropLine = { readonly target: string; readonly place: DocumentTabDropPlace };

export type TabDragRow = {
  draggable: boolean;
  onDragStart: (event: DragEvent<HTMLElement>) => void;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDragLeave: (event: DragEvent<HTMLElement>) => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
};

export type TextDocumentTabDrag = {
  /** The tab being dragged, dimmed in its row. */
  readonly dragging: string | null;
  /** Where the drag would land now, drawn as the drop line on that row. */
  readonly line: TabDropLine | null;
  /** The drag handlers of a tab's row. */
  row: (id: string, hasSubtabs: boolean) => TabDragRow;
};

export function useTextDocumentTabDrag(tabs: TextDocumentTabs): TextDocumentTabDrag {
  // The dragged id is kept here: a drag's data cannot be read until it drops.
  const [dragging, setDragging] = useState<string | null>(null);
  const [line, setLine] = useState<TabDropLine | null>(null);
  const { canEditTabs, canDrop, drop } = tabs;

  const end = useCallback(() => {
    setDragging(null);
    setLine(null);
  }, []);

  const row = useCallback(
    (id: string, hasSubtabs: boolean): TabDragRow => {
      const placeOf = (event: DragEvent<HTMLElement>) => {
        const rect = event.currentTarget.getBoundingClientRect();
        return tabDropPlace(event.clientY - rect.top, rect.height, hasSubtabs);
      };
      return {
        draggable: canEditTabs,
        onDragStart: (event) => {
          if (!canEditTabs) return;
          event.dataTransfer.setData(TAB_DRAG_TYPE, id);
          event.dataTransfer.effectAllowed = 'move';
          setDragging(id);
        },
        onDragOver: (event) => {
          if (dragging === null || !event.dataTransfer.types.includes(TAB_DRAG_TYPE)) return;
          const place = placeOf(event);
          if (!canDrop(dragging, id, place)) {
            setLine(null);
            return;
          }
          event.preventDefault();
          event.dataTransfer.dropEffect = 'move';
          setLine((was) =>
            was?.target === id && was.place === place ? was : { target: id, place },
          );
        },
        onDragLeave: (event) => {
          const to = event.relatedTarget;
          if (to instanceof Node && event.currentTarget.contains(to)) return;
          setLine((was) => (was?.target === id ? null : was));
        },
        onDrop: (event) => {
          if (dragging === null) return;
          event.preventDefault();
          drop(dragging, id, placeOf(event));
          end();
        },
        onDragEnd: end,
      };
    },
    [canDrop, canEditTabs, drop, dragging, end],
  );

  return { dragging, line, row };
}
