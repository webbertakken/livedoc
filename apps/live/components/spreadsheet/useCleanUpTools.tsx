'use client';

// Data › Data Clean-up's Remove Duplicates and Trim Whitespace, and Data › Randomise Range, over the open sheet
// (docs/specs/029-sheets/data-tools.md "Clean-up, split, randomise, stats"): each on the selection's last range (the
// block around a single cell), one change and one undo step, an Editor's (D467).
import { useMemo, useState, type ReactNode } from 'react';
import { randomiseRange, removeDuplicates, trimWhitespace, type GridRange } from '@livedoc/sheets';
import { useSheetController } from '@/components/sheets/sheet-controller';
import { cellSpokenValue } from '@/components/sheets/sheet-cell-speech';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import { debugLog } from '@/lib/debug-log';
import { useLatest } from '@/hooks/ui/useLatest';
import { track } from '@/lib/telemetry';
import {
  cleanUpRange,
  cryptoRandom,
  duplicatesRemovedLine,
  whitespaceTrimmedLine,
} from '@/lib/spreadsheet/clean-up';
import { RemoveDuplicatesDialog } from './RemoveDuplicatesDialog';

export function useCleanUpTools(): { actions: OfficeActions; dialog: ReactNode } {
  const c = useSheetController();
  const [open, setOpen] = useState<{ range: GridRange; result: string | null } | null>(null);
  const range = () => {
    const { ranges } = c.selectionNow();
    return cleanUpRange(ranges[ranges.length - 1]!, c.grid);
  };
  const close = () => {
    setOpen(null);
    c.focusGrid();
  };
  const refused = (tool: string, reason: string, words: string) => {
    debugLog('[sheet] clean-up refused', { tool, reason });
    c.toast(words);
  };
  const remove = (at: GridRange, cols: number[], header: boolean) => {
    const done = removeDuplicates(c.workbook, c.sheet.id, at, cols, header);
    if (!done) return;
    if ('refused' in done) return refused('duplicates', 'merge', done.refused);
    if (done.write && !c.write(done.write, 'Cleanup'))
      return debugLog('[sheet] clean-up refused', { tool: 'duplicates', reason: 'protected' });
    debugLog('[sheet] duplicates removed', {
      rows: done.compared,
      columns: cols.length,
      removed: done.removed,
      header,
    });
    if (done.write) track('Spreadsheet', 'Changed', 'Cleanup');
    setOpen({ range: at, result: duplicatesRemovedLine(done.removed, done.kept) });
  };
  const trim = () => {
    const done = trimWhitespace(c.workbook, c.sheet.id, range());
    if (done.write && !c.write(done.write, 'Cleanup'))
      return debugLog('[sheet] clean-up refused', { tool: 'trim', reason: 'protected' });
    debugLog('[sheet] whitespace trimmed', { cells: done.trimmed });
    if (done.write) track('Spreadsheet', 'Changed', 'Cleanup');
    c.toast(whitespaceTrimmedLine(done.trimmed));
  };
  const randomise = () => {
    const at = range();
    const w = randomiseRange(c.workbook, c.sheet.id, at, cryptoRandom);
    if (!w) return;
    if ('refused' in w) return refused('randomise', 'merge', w.refused);
    if (!c.write(w, 'Randomise'))
      return debugLog('[sheet] clean-up refused', { tool: 'randomise', reason: 'protected' });
    debugLog('[sheet] range randomised', { rows: at.r2 - at.r1 + 1 });
    track('Spreadsheet', 'Changed', 'Randomise');
  };
  // Stable while the role holds, so the menus' bindings are not rebuilt each render.
  const tools = useLatest({
    open: () => setOpen({ range: range(), result: null }),
    trim,
    randomise,
  });
  const canShape = c.canShape;
  const actions = useMemo<OfficeActions>(
    () =>
      canShape
        ? {
            'remove-duplicates': { run: () => tools.current.open() },
            'trim-whitespace': { run: () => tools.current.trim() },
            'randomise-range': { run: () => tools.current.randomise() },
          }
        : {},
    [canShape, tools],
  );
  const dialog = open ? (
    <RemoveDuplicatesDialog
      key={`${open.range.r1}:${open.range.c1}:${open.range.r2}:${open.range.c2}`}
      range={open.range}
      headerText={(col) => cellSpokenValue(c.sheet, c.workbook, c.locale, open.range.r1, col)}
      result={open.result}
      onRemove={(cols, header) => remove(open.range, cols, header)}
      onClose={close}
    />
  ) : null;
  return { actions, dialog };
}
