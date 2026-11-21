'use client';

// Format > Table > Table properties (docs/specs/034-text-documents/tables.md "Table properties"): the caret's table's
// properties, read again as the caret moves or the writing changes, and each change made as one undo step, the focus
// left in the panel. Its item is dimmed outside a table. An Editor's only (the panel is offered to no other).
import { useCallback, useEffect, useState } from 'react';
import type { EditorView } from 'prosemirror-view';
import { debugLog } from '@/lib/debug-log';
import type { OfficeAction } from '@/lib/office/office-catalogue';
import { track } from '@/lib/telemetry';
import {
  setTableProperty,
  tablePropertiesAt,
  type TableProperties,
  type TablePropertyChange,
} from '@/lib/text-document/text-document-table-properties';
import { startUndoStep } from '@/lib/text-document/text-document-undo';

/** The panel's item. */
export const TABLE_PROPERTIES_ITEM = 'table-properties';

export function useTextDocumentTableProperties({
  view,
  writes,
  subscribe,
  toggle,
}: {
  view: EditorView | null;
  writes: boolean;
  // Told when the caret moves or the writing changes.
  subscribe: (listener: () => void) => () => void;
  // The panel's own binding (useOfficePanels), dimmed here outside a table.
  toggle: OfficeAction | undefined;
}) {
  const read = useCallback(
    (): TableProperties | null =>
      view && !view.isDestroyed ? tablePropertiesAt(view.state) : null,
    [view],
  );
  const [properties, setProperties] = useState(read);
  useEffect(() => {
    const update = () => {
      const now = read();
      setProperties((was) => (JSON.stringify(was) === JSON.stringify(now) ? was : now));
    };
    update();
    return subscribe(update);
  }, [read, subscribe]);

  const apply = useCallback(
    (change: TablePropertyChange) => {
      if (!writes || !view || view.isDestroyed) return;
      startUndoStep(view);
      if (setTableProperty(change)(view.state, view.dispatch)) {
        startUndoStep(view);
        track('Element', 'Changed', 'TextDocumentTableProperties');
        debugLog('[text-document] table-properties', { field: change.field });
      }
    },
    [view, writes],
  );

  const actions: Record<string, OfficeAction> =
    writes && toggle
      ? { [TABLE_PROPERTIES_ITEM]: { ...toggle, disabled: properties === null } }
      : {};
  return { properties, apply, actions };
}
