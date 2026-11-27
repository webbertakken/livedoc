'use client';

// A spreadsheet's pivot tables made and changed (docs/specs/029-sheets/pivot-tables.md "Making one", "Pivot Table
// Editor"): Insert › Pivot Table's dialog, Create placing a pivot table on a new sheet or at a cell of any sheet, and
// the editor's changes written whole, each one undo step. A pivot table bound for another sheet waits until that
// sheet is open, then lands there and the editor opens on it. A value's details go on a new sheet ("Details").
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  makeAxisIds,
  PIVOT_DETAILS_BASE,
  pivotDetailsSheet,
  SheetName,
  type Sheet,
  type SheetPivot,
} from '@livedoc/sheets';
import type { SheetController } from '@/components/sheets/sheet-controller';
import { debugLog } from '@/lib/debug-log';
import { track } from '@/lib/telemetry';
import {
  newSheetPivot,
  PIVOT_SHEET_BASE,
  pivotCreateStart,
  readPivotCreate,
  type PivotCreatePlan,
} from '@/lib/spreadsheet/pivot-create';
import type { SheetBarChanges } from '../sheet-bar-actions';
import { CreatePivotTableDialog } from './CreatePivotTableDialog';

// Pivot tables waiting for their sheet to open, by its id: made from the sheet as it arrives.
const waiting = new Map<string, (sheet: Sheet) => SheetPivot>();

const newPivotId = (sheet: Sheet) =>
  makeAxisIds(1, Math.random, new Set((sheet.layout.objects ?? []).map((x) => x.id)))[0]!;

export function useSpreadsheetPivots(
  c: SheetController,
  // The sheet bar's changes: Create's new sheet, and opening the sheet a pivot table goes to.
  bar: Pick<SheetBarChanges, 'add' | 'show'> | null,
  // Opens the Pivot Table Editor on a pivot table.
  onEdit: (id: string) => void,
): {
  openCreate: () => void;
  dialog: ReactNode;
  // A pivot table set whole (the editor's changes), one undo step.
  change: (next: SheetPivot) => void;
  // The details of the value at (r, c) on a new sheet (pivot-tables.md "Details", D616); false when it is no value.
  showDetails: (r: number, c: number) => boolean;
} {
  const [start, setStart] = useState<string | null>(null);
  const { write, sheet, canShape } = c;

  const place = useCallback(
    (pivot: SheetPivot) => {
      const ok = write(
        { kind: 'layout', changes: [{ k: 'object', id: pivot.id, object: pivot }] },
        'PivotTable',
      );
      debugLog(`[sheet-pivots] inserted sheet=${sheet.id} pivot=${pivot.id} ok=${ok}`);
      if (!ok) return;
      track('Spreadsheet', 'Added', 'PivotTable');
      onEdit(pivot.id);
    },
    [write, sheet.id, onEdit],
  );

  // A pivot table made for this sheet before it opened lands now.
  useEffect(() => {
    const make = waiting.get(sheet.id);
    if (!make || !canShape) return;
    waiting.delete(sheet.id);
    place(make(sheet));
  }, [sheet, canShape, place]);

  const close = () => {
    setStart(null);
    c.focusGrid();
  };
  const create = (plan: Extract<PivotCreatePlan, { ok: true }>) => {
    setStart(null);
    if (plan.to.kind === 'new') {
      if (!bar) return;
      const name = SheetName.numbered(
        PIVOT_SHEET_BASE,
        c.workbook.sheetList().map((s) => s.title),
      );
      const ids = bar.add('afterOpen', { name });
      waiting.set(ids.sheetId, (s) =>
        newSheetPivot(newPivotId(s), s.id, { r: s.layout.rows[0]!, c: s.layout.cols[0]! }, plan),
      );
      return;
    }
    const { sheetId, at } = plan.to;
    if (sheetId === sheet.id) {
      place(newSheetPivot(newPivotId(sheet), sheetId, at, plan));
      return;
    }
    const target = c.workbook.sheetList().find((s) => s.id === sheetId);
    if (!target || !bar) return;
    waiting.set(sheetId, (s) => newSheetPivot(newPivotId(s), s.id, at, plan));
    bar.show(target.tabId);
  };

  const openCreate = () => {
    if (!canShape) return;
    setStart(pivotCreateStart(c.workbook, sheet, c.selectionNow()));
  };
  const change = useCallback(
    (next: SheetPivot) => {
      const ok = write(
        { kind: 'layout', changes: [{ k: 'object', id: next.id, object: next }] },
        'PivotTable',
      );
      debugLog(`[sheet-pivots] changed sheet=${sheet.id} pivot=${next.id} ok=${ok}`);
    },
    [write, sheet.id],
  );

  const showDetails = useCallback(
    (r: number, col: number) => {
      const details = canShape && bar ? c.workbook.pivotDetailsAt(sheet.id, r, col) : null;
      if (!details || !bar) return false;
      const name = SheetName.numbered(
        PIVOT_DETAILS_BASE,
        c.workbook.sheetList().map((s) => s.title),
        '',
      );
      bar.add('afterOpen', {
        name,
        seed: pivotDetailsSheet(c.workbook, details, { id: sheet.id, title: name }),
      });
      debugLog(
        `[sheet-pivots] details sheet=${sheet.id} pivot=${details.pivotId} rows=${details.rows.length - 1}`,
      );
      track('Spreadsheet', 'Added', 'PivotDetails');
      return true;
    },
    [canShape, bar, c.workbook, sheet.id],
  );

  const dialog =
    start === null ? null : (
      <CreatePivotTableDialog
        start={start}
        read={(range, to, location) =>
          readPivotCreate(c.workbook.ctxFor(sheet.id), range, to, location)
        }
        onCreate={create}
        onClose={close}
      />
    );
  return { openCreate, dialog, change, showDetails };
}
