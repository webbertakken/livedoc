'use client';

// Data › Split Text to Columns over the open sheet (docs/specs/029-sheets/data-tools.md "Split Text to Columns"): the
// selected column split at once by the separator found, asking first (Replace Data?) where it would write over cells;
// then the Separator chip, each choice splitting the original text again as a change of its own (D468). An Editor's.
import { useMemo, useState, type ReactNode } from 'react';
import {
  splitOrigin,
  splitTextToColumns,
  type GridRange,
  type SheetWrite,
  type SplitOrigin,
  type SplitSeparator,
} from '@livedoc/sheets';
import { useSheetController } from '@/components/sheets/sheet-controller';
import type { SplitChip, SplitChipValue } from '@/components/sheets/sheet-split-chip-context';
import { OfficeDialog } from '@/components/office/OfficeDialog';
import { useLatest } from '@/hooks/ui/useLatest';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import { debugLog } from '@/lib/debug-log';
import { track } from '@/lib/telemetry';
import { REPLACE_DATA_LINE, SPLIT_REFUSED } from '@/lib/spreadsheet/split-text';

type Held = SplitChip & { origin: SplitOrigin };
type Pending = { held: Held; write: SheetWrite; width: number; rows: number };

export function useSplitText(): {
  actions: OfficeActions;
  chip: SplitChipValue;
  dialog: ReactNode;
} {
  const c = useSheetController();
  const [held, setHeld] = useState<Held | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const land = (p: Pending) => {
    if (!c.write(p.write, 'Split'))
      return debugLog('[sheet] clean-up refused', { tool: 'split', reason: 'protected' });
    debugLog('[sheet] text split', {
      separator: p.held.separator.kind,
      rows: p.rows,
      pieces: p.width,
    });
    track('Spreadsheet', 'Changed', 'Split');
    setHeld({ ...p.held, origin: { ...p.held.origin, width: p.width } });
  };
  // Split `range` by `separator`, from `origin` (the first split's own when none was made yet).
  const split = (range: GridRange, separator: SplitSeparator, origin: SplitOrigin) => {
    const done = splitTextToColumns(c.workbook, c.sheet.id, range, separator, Math.random, origin);
    if (!done) return;
    const next: Held = { sheetId: c.sheet.id, range, separator, origin };
    if ('refused' in done) {
      debugLog('[sheet] clean-up refused', { tool: 'split', reason: done.refused });
      return c.toast(SPLIT_REFUSED[done.refused]);
    }
    if (!done.write) return setHeld(next);
    const p = { held: next, write: done.write, width: done.width, rows: done.rows };
    if (done.overwrites) return setPending(p);
    land(p);
  };
  const open = () => {
    const { ranges } = c.selectionNow();
    const range = ranges[ranges.length - 1]!;
    if (range.c1 !== range.c2) {
      debugLog('[sheet] clean-up refused', { tool: 'split', reason: 'columns' });
      return c.toast(SPLIT_REFUSED.columns);
    }
    const origin = splitOrigin(c.workbook, c.sheet.id, range);
    if (origin) split(range, { kind: 'detect' }, origin);
  };
  const tools = useLatest({
    open,
    choose: (separator: SplitSeparator) => held && split(held.range, separator, held.origin),
  });
  const canShape = c.canShape;
  const actions = useMemo<OfficeActions>(
    () => (canShape ? { 'split-text-to-columns': { run: () => tools.current.open() } } : {}),
    [canShape, tools],
  );
  const chip = useMemo<SplitChipValue>(
    () => ({
      chip: held,
      choose: (separator) => void tools.current.choose(separator),
      close: () => setHeld(null),
    }),
    [held, tools],
  );
  const close = () => {
    setPending(null);
    c.focusGrid();
  };
  const dialog = pending ? (
    <OfficeDialog
      open
      onClose={close}
      title="Replace Data?"
      primary={{
        label: 'Replace',
        onPress: () => {
          land(pending);
          close();
        },
      }}
    >
      <p className="pt-1 text-body">{REPLACE_DATA_LINE}</p>
    </OfficeDialog>
  ) : null;
  return { actions, chip, dialog };
}
