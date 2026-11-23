'use client';

// The sheet bar's summary of the selection (docs/specs/029-sheets/surface.md "Sheet bar", D132): for more than one
// cell, the person's pick of Sum, Average, Min, Max, Count and Count Numbers, its menu listing each with its value.
// Drawn into the sheet bar's end from inside the open sheet, which holds the selection it counts.
import { useMemo, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { cellKey, formatNumber, type CellFormat } from '@livedoc/sheets';
import { OfficeChoiceMenu } from '@/components/office/OfficeChoiceMenu';
import { useSheetController } from '@/components/sheets/sheet-controller';
import { countSelection, type SelectionStats } from '@/components/sheets/selection-stats';
import type { OfficeActions, OfficeEntry } from '@/lib/office/office-catalogue';
import {
  isCountKind,
  summaryShown,
  summaryValue,
  SUMMARY_KINDS,
  type SummaryKind,
} from '@/lib/spreadsheet/selection-summary';
import { setSummaryPick, useSummaryPick } from '@/lib/spreadsheet/summary-pick';
import { useSummarySlot } from './summary-slot';

// The summary button's width: room for "Count Numbers: 123,456".
const SUMMARY_BUTTON_PX = 176;

const ENTRIES: readonly OfficeEntry[] = SUMMARY_KINDS.map((kind) => ({
  kind: 'item',
  id: kind,
  label: kind,
  level: 'view',
  status: 'built',
  checkable: 'radio',
}));

/** A kind's words with its value: "Sum: 1,234"; a kind with no value says so ("Average: –"). */
export function summaryText(
  kind: SummaryKind,
  stats: SelectionStats,
  format: CellFormat | undefined,
  locale: string,
): string {
  const value = summaryValue(kind, stats);
  if (value === null) return `${kind}: –`;
  return `${kind}: ${isCountKind(kind) ? formatNumber(value, { nf: 'number', dp: 0 }, locale) : formatNumber(value, format, locale)}`;
}

export function SheetBarSummary() {
  const slot = useSummarySlot();
  const c = useSheetController();
  const pick = useSummaryPick();
  const { selection, workbook, sheet, geometry, version } = c;
  // Counted again only when the selection or a value moves, never on a scroll frame.
  const counted = useMemo(
    () =>
      countSelection({
        ranges: selection.ranges,
        extent: workbook.extent(sheet.id),
        value: (r, col) => workbook.value(sheet.id, r, col),
        hiddenRow: (r) => geometry.hiddenRow(r),
      }),
    [selection, workbook, sheet, geometry, version], // oxlint-disable-line react/exhaustive-deps
  );
  const single =
    selection.ranges.length === 1 &&
    selection.ranges[0]!.r1 === selection.ranges[0]!.r2 &&
    selection.ranges[0]!.c1 === selection.ranges[0]!.c2;
  if (!slot || single) return null;
  if (counted === 'too-many')
    return createPortal(
      <span role="status" className="px-2 text-[12px] text-(--office-muted)">
        Too many cells
      </span>,
      slot,
    );
  const { r, c: col } = selection.active;
  const format = sheet.cells.get(cellKey(sheet.layout.rows[r]!, sheet.layout.cols[col]!))?.format;
  const text = (kind: SummaryKind) => summaryText(kind, counted, format, c.locale);
  const shown = summaryShown(pick, counted);
  const actions: OfficeActions = Object.fromEntries(
    SUMMARY_KINDS.map((kind) => [
      kind,
      { run: () => setSummaryPick(kind), checked: kind === pick, label: text(kind) },
    ]),
  );
  // Escape on the closed summary hands focus back to the grid (grid-and-editing.md "Moving around").
  const backToGrid = (e: KeyboardEvent<HTMLSpanElement>) => {
    const trigger = e.target as HTMLElement;
    if (e.key !== 'Escape' || !trigger.hasAttribute('aria-haspopup')) return;
    if (trigger.getAttribute('aria-expanded') === 'true') return;
    e.preventDefault();
    c.focusGrid();
  };
  return createPortal(
    <span className="contents" onKeyDown={backToGrid}>
      <OfficeChoiceMenu
        id="selection-summary"
        label="Selection Summary"
        value={text(shown)}
        entries={ENTRIES}
        actions={actions}
        width={SUMMARY_BUTTON_PX}
        tabIndex={0}
        className="flex h-7 items-center gap-1 rounded-md px-2 text-[12px] tabular-nums text-(--office-ink) hover:bg-(--office-menu-hover)"
      />
      <span role="status" className="sr-only">
        {text(shown)}
      </span>
    </span>,
    slot,
  );
}
