'use client';

// Format > Columns (docs/specs/034-text-documents/page-layout.md "Columns"): One, Two and Three columns, the caret's
// section's count checked, and More options' Column options; dimmed while pageless, bound only where the session
// writes (an Editor), so a Participant and a Viewer see none of them.
import { useCallback, useMemo, useState, type RefObject } from 'react';
import type { EditorView } from 'prosemirror-view';
import type * as Y from 'yjs';
import type { TextDocumentFormat } from '@livedoc/document';
import { Columns, type PageSetup } from '@livedoc/text-documents';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import { track } from '@/lib/telemetry';
import { indentUnit } from '@/lib/text-document/indent-units';
import { applyColumns } from '@/lib/text-document/text-document-columns';
import { TextDocumentColumnsDialog } from './TextDocumentColumnsDialog';

export const COLUMN_ITEMS = {
  'columns-one': 1,
  'columns-two': 2,
  'columns-three': 3,
} as const;
export const COLUMNS_MORE_ITEM = 'columns-more';

export function useTextDocumentColumns({
  view,
  liveDoc,
  format,
  writes,
  pageless,
  caretSetup,
}: {
  view: EditorView | null;
  liveDoc: RefObject<Y.Doc | null>;
  format: TextDocumentFormat;
  writes: boolean;
  pageless: boolean;
  // The setup of the section the caret is in: its columns are the ones shown.
  caretSetup: PageSetup;
}) {
  const [open, setOpen] = useState(0);
  const unit = useMemo(() => indentUnit(), []);
  const current = Columns.of(caretSetup);

  // Counted only when something changed.
  const apply = useCallback(
    (columns: Columns) => {
      const doc = liveDoc.current;
      if (!doc || !view || view.isDestroyed) return;
      if (applyColumns(view, doc, format, columns)) track('Tab', 'Changed', 'TextDocumentColumns');
      view.focus();
    },
    [liveDoc, view, format],
  );

  const actions = useMemo((): OfficeActions => {
    if (!writes || !view) return {};
    const entries: [string, OfficeActions[string]][] = Object.entries(COLUMN_ITEMS).map(
      ([item, count]) => [
        item,
        {
          // A count from the submenu keeps the section's spacing and line.
          run: () => apply({ ...current, count }),
          checked: current.count === count,
          disabled: pageless,
        },
      ],
    );
    entries.push([COLUMNS_MORE_ITEM, { run: () => setOpen((n) => n + 1), disabled: pageless }]);
    return Object.fromEntries(entries);
  }, [writes, view, apply, current, pageless]);

  const close = () => {
    setOpen(0);
    view?.focus();
  };

  const dialog =
    open > 0 ? (
      <TextDocumentColumnsDialog
        key={open}
        open
        setup={caretSetup}
        unit={unit}
        onClose={close}
        onApply={(columns) => {
          setOpen(0);
          apply(columns);
        }}
      />
    ) : null;

  return { actions, dialog };
}
