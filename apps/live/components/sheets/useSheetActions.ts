'use client';

// Everything a Sheet's keys, toolbar and menus do (docs/specs/029-sheets/sheet.md "Editing", "Keyboard",
// "Formatting", "Rows and columns", "Sort", "Filter", "Freeze"), built from the engine's command builders and sent
// through the controller's write. One place, so a toolbar button and its shortcut can never differ.
import { chartRangeOf, chartSizeOf, newChartAnchor, NOTHING_TO_CHART } from './sheet-charts';
import { pivotsCoveredBy } from './pivots/sheet-pivots';
import { pivotGroupRenameAt } from '@/lib/spreadsheet/pivot-group-rename';
import { debugLog } from '@/lib/debug-log';
import { useMemo } from 'react';
import { acceptSmartFill, offerSmartFill } from './sheet-smart-fill';
import { rowEnd, rowTop } from './sheet-geometry';
import { drawnRect } from './sheet-drawn-selection';
import type { ChartType } from '@livedoc/document';
import {
  PARSE_FAILURE_COPY,
  appendAxis,
  borderRange,
  callsOf,
  clearRanges,
  resetSheetWrite,
  colWidth,
  deleteAxis,
  extendSelection,
  fillFromEdge,
  fillRange,
  formatA1,
  formatRanges,
  freeze,
  hideAxis,
  showAxis,
  type LayoutChange,
  insertAxis,
  mergeRange,
  moveAxis,
  moveCells,
  moveSelection,
  parseFormula,
  resizeAxis,
  localMs,
  serialFromMs,
  zonedMs,
  setFilterCondition,
  single,
  sortFilter,
  sortRange,
  sortSheet,
  stepDecimals,
  toggleFilter,
  typeInto,
  typeIntoRanges,
  unmergeRange,
  cellKey,
  type Border,
  type BorderMode,
  type MergeMode,
  type CellFormat,
  type Dir,
  type FilterCondition,
  type FormatPatch,
  type GridRange,
  type NumberFormatKind,
  type SortKey,
  shiftCells,
  type ShiftMode,
  workbookRuleChecks,
  validateWrite,
  writeForRules,
  type SheetWrite,
  textWidth,
  cellEditText,
} from '@livedoc/sheets';
import { track } from '@/lib/telemetry';
import { useSheetController, type SheetController } from './sheet-controller';
import { freezeLimit } from './sheet-freeze';
import { fontPx, roughWidth } from './SheetCells';
import { sheetRuleActions } from './rules/sheet-rule-actions';
import { sheetTableActions } from './tables/sheet-table-actions';
import { sheetOutlineActions } from './sheet-outline-actions';

type EditResult = { ok: true } | { ok: false; message: string; at: number };

function primary(c: SheetController): GridRange {
  const ranges = c.selectionNow().ranges;
  return ranges[ranges.length - 1]!;
}

function activeFormat(c: SheetController): CellFormat | undefined {
  const { r, c: col } = c.selectionNow().active;
  const rowId = c.sheet.layout.rows[r];
  const colId = c.sheet.layout.cols[col];
  return rowId && colId ? c.sheet.cells.get(cellKey(rowId, colId))?.format : undefined;
}

// The text an edit of the active cell starts from (Enter, F2, a double-click), and what the formula bar shows: the
// input as typed. A number in a Date format reads as that date, in the locale's short form (formulas.md "What a
// typed input becomes"), never as its serial number, when the date reads back as the same number; else plainly.
export function inputTextAt(c: SheetController, r: number, col: number): string {
  const rowId = c.sheet.layout.rows[r];
  const colId = c.sheet.layout.cols[col];
  const cell = rowId && colId ? c.sheet.cells.get(cellKey(rowId, colId)) : undefined;
  return cellEditText(cell, c.workbook.ctxFor(c.sheet.id), c.locale);
}

// What the first value a Reject rule refuses in a typed write says (the rule's Help Text, else its line), or null.
function ruleRefusal(c: SheetController, write: SheetWrite): string | null {
  const layout = c.sheet.layout;
  if (!layout.rules?.length) return null;
  const check = validateWrite(c.sheet, writeForRules(layout, write), {
    locale: c.locale,
    ...workbookRuleChecks(c.workbook, c.sheet.id),
  });
  return !check.ok && check.error === 'value_invalid' ? (check.line ?? null) : null;
}

function firstUse(text: string): void {
  if (!text.startsWith('=')) return;
  const parsed = parseFormula(text);
  if (!parsed.ok) return;
  for (const name of callsOf(parsed.ast)) track('Sheet', 'Used', name);
}

export function useSheetActions() {
  const c = useSheetController();
  return useMemo(() => {
    const sel = () => c.selectionNow();
    const ranges = () => c.selectionNow().ranges;
    const fmt = (patch: FormatPatch) => {
      const w = formatRanges(c.workbook, c.sheet.id, ranges(), patch);
      if (w) c.write(w, 'Format');
    };
    const go = (s: typeof c.selection) => {
      c.setTabRun(null);
      c.setSelection(s);
    };
    const announceCell = (r: number, col: number) => c.announce(formatA1(r, col));
    return {
      // ---- Editing ----
      startEdit: (origin: 'type' | 'cell' | 'bar', text?: string) => {
        if (!c.canEdit) return;
        const { r, c: col } = sel().active;
        c.setEditing({ r, c: col, origin, draft: text ?? inputTextAt(c, r, col) });
      },
      cancelEdit: () => {
        c.setEditing(null);
        c.focusGrid();
      },
      // Save the draft, then move (Enter down, Tab right, ...). `all` is Ctrl+Enter: into every selected cell.
      // `draft`: what to save in place of the editor's draft (a dropdown option picked while typing).
      commitEdit: (move: Dir | 'none', all = false, draft?: string): EditResult => {
        const e = c.editing && draft !== undefined ? { ...c.editing, draft } : c.editing;
        if (!e) return { ok: true };
        // Typing over a pivot table's custom group renames it (pivot-tables.md "Grouping in the grid"): an Editor's.
        const renamed =
          !all && c.canShape ? pivotGroupRenameAt(c.workbook, c.sheet, e.r, e.c, e.draft) : null;
        if (renamed && 'refused' in renamed) return { ok: false, message: renamed.refused, at: 0 };
        if (renamed?.next) {
          const ok = c.write(
            {
              kind: 'layout',
              changes: [{ k: 'object', id: renamed.next.id, object: renamed.next }],
            },
            'PivotTable',
          );
          debugLog(
            `[sheet-pivots] group renamed sheet=${c.sheet.id} pivot=${renamed.next.id} ok=${ok}`,
          );
        }
        const result = renamed
          ? null
          : all
            ? typeIntoRanges(c.workbook, c.sheet.id, { r: e.r, c: e.c }, ranges(), e.draft)
            : typeInto(c.workbook, c.sheet.id, { r: e.r, c: e.c }, e.draft);
        if (result && !result.ok) {
          const reason = result.read.reason;
          return {
            ok: false,
            message:
              reason === 'input_too_long'
                ? 'A cell holds up to 10,000 characters'
                : PARSE_FAILURE_COPY[reason],
            at: result.read.at,
          };
        }
        if (result?.ok) {
          // A value the cell's Reject rule refuses keeps the edit open and says why (data-validation.md).
          const refused = ruleRefusal(c, result.write);
          if (refused) return { ok: false, message: refused, at: 0 };
          // An edit ends the copied range's marquee, as in Sheets and Excel (what the clipboard holds stays).
          c.setMarquee(null);
          const formula = e.draft.startsWith('=');
          const saved = c.write(result.write, formula ? 'Formula' : 'Cell');
          if (saved) firstUse(e.draft);
          // A typed text in one cell may start a Smart Fill offer (D148); any other edit ends one.
          if (saved && !formula && !all) offerSmartFill(c, { r: e.r, c: e.c });
          else c.setSmartFill(null);
        }
        c.setEditing(null);
        if (move !== 'none' && !all) {
          const started = c.tabRun();
          const run = started && started.r === e.r ? started : null;
          // Enter after a run of Tabs: the next row, in the column the run began in.
          const from = move === 'down' && run ? { r: e.r, c: run.c } : { r: e.r, c: e.c };
          go(moveSelection(single(from), move, c.grid));
          if (move === 'right') c.setTabRun(run ?? { r: e.r, c: e.c });
        }
        c.focusGrid();
        return { ok: true };
      },
      // ---- Moving ----
      move: (dir: Dir, jump = false, extend = false) => {
        const next = extend
          ? extendSelection(sel(), dir, c.grid, jump)
          : moveSelection(sel(), dir, c.grid, jump);
        go(next);
        announceCell(next.active.r, next.active.c);
      },
      goTo: (range: GridRange) => {
        go({
          ranges: [range],
          active: { r: range.r1, c: range.c1 },
          anchor: { r: range.r1, c: range.c1 },
        });
      },
      // ---- Clearing and formats ----
      clear: (what: 'inputs' | 'formats' | 'all') => {
        const w = clearRanges(c.sheet, ranges(), what);
        // A selection covering a pivot table's whole output removes it with the clear, one step (pivot-tables.md
        // "Working with one", D613).
        const pivots =
          what !== 'formats' && c.canShape ? pivotsCoveredBy(c.workbook, c.sheet, ranges()) : [];
        if (pivots.length && w.kind === 'cells') {
          const ok = c.write(
            {
              kind: 'layout',
              changes: pivots.map((id) => ({ k: 'object' as const, id, object: null })),
              cells: w.cells,
            },
            'PivotTable',
          );
          debugLog(`[sheet-pivots] removed sheet=${c.sheet.id} pivots=${pivots.length} ok=${ok}`);
          return;
        }
        // Clear Formatting with nothing to clear says so, rather than meet the press with silence (Delete on an
        // empty cell stays quiet).
        if (w.kind === 'cells' && w.cells.length === 0) {
          if (what === 'formats') c.notify('No formatting to clear here');
          return;
        }
        c.write(w, what === 'formats' ? 'Format' : 'Clear');
      },
      format: fmt,
      toggle: (flag: 'b' | 'i' | 'u' | 'st') => {
        fmt({ [flag]: activeFormat(c)?.[flag] ? null : true });
      },
      numberFormat: (nf: NumberFormatKind, cur?: string) => {
        fmt({ nf: nf === 'auto' ? null : nf, dp: null, nc: null, ...(cur ? { cur } : {}) });
      },
      decimals: (delta: 1 | -1) => {
        const f = activeFormat(c);
        const v = c.workbook.value(c.sheet.id, sel().active.r, sel().active.c);
        fmt({
          dp: stepDecimals(
            f?.dp,
            !f?.nf || f.nf === 'auto',
            typeof v === 'number' ? v : null,
            delta,
          ),
        });
      },
      borders: (mode: BorderMode, border: Border) => {
        const w = borderRange(c.workbook, c.sheet.id, primary(c), mode, border);
        if (w) c.write(w, 'Format');
      },
      // Merge: asks first (through `confirm`) when it would clear inputs.
      merge: (mode: MergeMode, confirm: () => boolean) => {
        const m = mergeRange(c.sheet, primary(c), mode);
        if (!m) return;
        if (m.needsConfirm && !confirm()) return;
        c.write(m.write, 'Merge');
      },
      unmerge: () => {
        const w = unmergeRange(c.sheet, primary(c));
        if (w) c.write(w, 'Merge');
      },
      activeFormat: () => activeFormat(c),
      // ---- Fill ----
      // A fill's source and target in drawn rows: the rows a view's order draws (D494); stored rows without one.
      fill: (source: GridRange, target: GridRange, copy: boolean) => {
        const order = c.geometry.order;
        const w = fillRange(c.workbook, c.sheet.id, source, target, copy, false, order);
        if (w) c.write(w, 'Fill');
      },
      fillEdge: (dir: 'down' | 'right') => {
        const g = c.geometry;
        const range = g.order ? drawnRect(g, c.selectionNow()) : primary(c);
        const w = fillFromEdge(c.workbook, c.sheet.id, range, dir, g.order);
        if (w) c.write(w, 'Fill');
      },
      // ---- Rows and columns ----
      insert: (axis: 'r' | 'c', side: 'before' | 'after') => {
        const g = primary(c);
        const [a, b] = axis === 'r' ? [g.r1, g.r2] : [g.c1, g.c2];
        // As many as the grid still has room for, by the sheet's kind's limits over its workbook.
        const room = c.workbook.room(c.sheet.id);
        const w = insertAxis(c.sheet, axis, side === 'before' ? a : b, b - a + 1, side, room);
        if (!w || w.kind !== 'layout') return;
        c.write(w, axis === 'r' ? 'Rows' : 'Columns');
        const n = (w.changes[0] as { ids: readonly string[] }).ids.length;
        c.announce(`${n} ${axis === 'r' ? 'row' : 'column'}${n > 1 ? 's' : ''} inserted`);
      },
      // Insert Cells / Delete Cells: the cells beside the selection move to make room or close the gap.
      shift: (mode: ShiftMode) => {
        const res = shiftCells(c.workbook, c.sheet.id, primary(c), mode);
        if (res) c.writeAll(res.edits, 'Shift');
      },
      appendRows: (count: number) => {
        const w = appendAxis(c.sheet, 'r', count, c.workbook.room(c.sheet.id));
        if (w) c.write(w, 'Rows');
      },
      remove: (axis: 'r' | 'c') => {
        const g = primary(c);
        const w =
          axis === 'r'
            ? deleteAxis(c.sheet, 'r', g.r1, g.r2)
            : deleteAxis(c.sheet, 'c', g.c1, g.c2);
        if (!w || !c.write(w, axis === 'r' ? 'Rows' : 'Columns')) return;
        // The cell where the first deleted line was, or the new last line when the deleted ones were last.
        const rows = c.sheet.layout.rows.length - (axis === 'r' ? g.r2 - g.r1 + 1 : 0);
        const cols = c.sheet.layout.cols.length - (axis === 'c' ? g.c2 - g.c1 + 1 : 0);
        go(
          single({
            r: Math.max(0, Math.min(g.r1, rows - 1)),
            c: Math.max(0, Math.min(g.c1, cols - 1)),
          }),
        );
      },
      // Hide the selection's lines (or from..to); show the hidden ones among them, none hidden being no change.
      hide: (axis: 'r' | 'c', hidden: boolean, from?: number, to?: number) => {
        const g = primary(c);
        const [a, b] =
          from !== undefined ? [from, to ?? from] : axis === 'r' ? [g.r1, g.r2] : [g.c1, g.c2];
        const w = hidden ? hideAxis(c.sheet, axis, a, b, true) : showAxis(c.sheet, axis, a, b);
        if (w) c.write(w, 'Hide');
      },
      resize: (axis: 'r' | 'c', positions: number[], px: number | null) => {
        const w = resizeAxis(c.sheet, axis, positions, px);
        if (w) c.write(w, 'Resize');
      },
      // Fit to Data (a header's menu, or a double-click on its edge). A row fits its text by itself (sheet.md "Row
      // height"), so fitting rows is taking their own sizes away: they are automatic again. A column takes the width
      // of its widest value, measured roughly from its text.
      autofit: (axis: 'r' | 'c', positions: number[]) => {
        if (axis === 'r') {
          const { rows, rowSize } = c.sheet.layout;
          const sized = positions.filter((p) => rowSize?.[rows[p]!] !== undefined);
          const w = sized.length ? resizeAxis(c.sheet, 'r', sized, null) : null;
          if (w) c.write(w, 'Resize');
          return;
        }
        // Every column's width in one write: one change and one undo step.
        const ext = c.workbook.extent(c.sheet.id);
        const changes: LayoutChange[] = [];
        for (const p of positions) {
          let best = 24;
          for (let r = 0; r < ext.rows; r++) {
            const rowId = c.sheet.layout.rows[r]!;
            const colId = c.sheet.layout.cols[p]!;
            const f = c.sheet.cells.get(cellKey(rowId, colId))?.format;
            const v = c.workbook.value(c.sheet.id, r, p);
            if (v === null) continue;
            const text = typeof v === 'object' ? '#VALUE!' : String(v);
            // A number is drawn in tabular figures (sheet.md "The grid"): its room is measured from them.
            const figures =
              typeof v === 'number'
                ? textWidth(text, fontPx(f), { font: f?.ff ?? c.font, bold: !!f?.b, tabular: true })
                : 0;
            best = Math.max(best, roughWidth(text, fontPx(f)) + 14, figures + 14);
          }
          const w = resizeAxis(c.sheet, 'c', [p], Math.min(2000, Math.ceil(best)));
          if (w?.kind === 'layout') changes.push(...w.changes);
        }
        if (changes.length) c.write({ kind: 'layout', changes }, 'Resize');
      },
      // Dragged headers: lines from..to moved to before position `before`; true when they moved.
      moveAxis: (axis: 'r' | 'c', from: number, to: number, before: number): boolean => {
        const w = moveAxis(c.sheet, axis, from, to, before);
        if (w && 'refused' in w) c.toast(w.refused);
        return !!w && !('refused' in w) && c.write(w, axis === 'r' ? 'Rows' : 'Columns');
      },
      // A selection dragged by its border to `to` (grid-and-editing.md "Fill and move"): moved with every
      // reference following, or copied; the landing is selected. A merge it would split refuses it (D146).
      moveCells: (source: GridRange, to: GridRange, copy: boolean): void => {
        const res = moveCells(c.workbook, c.sheet.id, source, { r: to.r1, c: to.c1 }, copy);
        if (!res) return;
        if ('refused' in res) return c.toast(res.refused);
        if (!c.writeAll(res.edits, 'Move')) return;
        const r = res.range;
        c.setSelection({ ranges: [r], active: { r: r.r1, c: r.c1 }, anchor: { r: r.r1, c: r.c1 } });
      },
      // Smart Fill's offer taken (D150, D151); false when none stands.
      acceptSmartFill: () => acceptSmartFill(c),
      dismissSmartFill: () => c.setSmartFill(null),
      // A line's size as drawn: a row's is its fit when it is automatic (sheet.md "Row height").
      sizeOf: (axis: 'r' | 'c', p: number) => {
        return axis === 'r'
          ? rowEnd(c.geometry, p) - rowTop(c.geometry, p)
          : colWidth(c.sheet.layout, c.sheet.layout.cols[p]!);
      },
      // ---- Sort, filter, freeze ----
      sortColumn: (ascending: boolean) => {
        const w = sortSheet(c.workbook, c.sheet.id, sel().active.c, ascending);
        if (w && 'refused' in w) c.toast(w.refused);
        else if (w) {
          c.write(w, 'Sort');
          c.announce(ascending ? 'Sorted A to Z' : 'Sorted Z to A');
        }
      },
      // A filter column's own sort: the filter's rows under its header, by that column (not the active cell's).
      sortFilter: (colId: string, ascending: boolean) => {
        const w = sortFilter(c.workbook, c.sheet.id, colId, ascending);
        if (w && 'refused' in w) c.toast(w.refused);
        else if (w) {
          c.write(w, 'Sort');
          c.announce(ascending ? 'Sorted A to Z' : 'Sorted Z to A');
        }
      },
      sortRange: (keys: SortKey[], header: boolean) => {
        const w = sortRange(c.workbook, c.sheet.id, primary(c), keys, header);
        if (w && 'refused' in w) c.toast(w.refused);
        else if (w) c.write(w, 'Sort');
      },
      toggleFilter: () => {
        const w = toggleFilter(c.workbook, c.sheet.id, primary(c), c.grid);
        // Over part of a table, refused with the way to its own filter (data-tools.md, D481).
        if (w && 'refused' in w) {
          debugLog('[sheet] filter refused', { reason: 'filter_overlaps_table' });
          c.toast(w.refused);
        } else if (w) c.write(w, 'Filter');
      },
      // In the open filter view when there is one (useFilterViews), else the sheet's filter.
      setFilter: (colId: string, cond: FilterCondition | null) => {
        if (c.filterViews.open) c.filterViews.setCondition(colId, cond);
        else c.write(setFilterCondition(colId, cond), 'Filter');
      },
      // Insert Chart: the selection (or the data around the cell) as a chart in the Sheet, beside it, in view.
      insertChart: (type: ChartType) => {
        const pick = chartRangeOf(c.workbook, c.sheet, c.selectionNow());
        if (!pick) return c.toast(NOTHING_TO_CHART);
        const view = {
          width: Math.max(0, c.view.width - c.geometry.headW),
          height: Math.max(0, c.view.height - c.geometry.headH),
        };
        c.placeChart?.(
          type,
          pick,
          newChartAnchor(c.geometry, c.sheet, pick, chartSizeOf(type), c.scroll, view),
        );
      },
      // Clear Sheet: the sheet back to how a placed one starts (Setup Sheet shows again), its charts taken with it (a
      // set-up-again sheet would otherwise show them twice), one change and one undo.
      clearSheet: () => {
        const charts = c.chartsRemoval?.() ?? null;
        if (c.write(resetSheetWrite(c.sheet), 'Clear', charts ?? undefined)) charts?.redo();
      },
      // The sheet's look (Sheet Settings): gridlines, headers, default sizes (null back to the default).
      setOptions(options: {
        showGrid?: boolean;
        showHeaders?: boolean;
        colWidth?: number | null;
        rowHeight?: number | null;
      }) {
        c.write({ kind: 'layout', changes: [{ k: 'options', ...options }] }, 'Settings');
      },
      // Clamped to the freeze limits (sheet-freeze.ts), so Up to Row 300 freezes what it may rather than being refused.
      freeze: (rows?: number, cols?: number) => {
        const most = (n: number | undefined, axis: 'r' | 'c') =>
          n === undefined ? n : Math.min(n, freezeLimit(c.geometry, c.view, axis));
        c.write(freeze(most(rows, 'r'), most(cols, 'c')), 'Freeze');
      },
      // ---- Dates ----
      typeNow: (what: 'date' | 'time') => {
        // Today on the spreadsheet's wall clock, or this person's (formulas.md "Locale").
        const zone = c.workbook.timeZone;
        const serial = serialFromMs(zone ? zonedMs(Date.now(), zone) : localMs(Date.now()));
        const { r, c: col } = sel().active;
        const rowId = c.sheet.layout.rows[r]!;
        const colId = c.sheet.layout.cols[col]!;
        const n = what === 'date' ? Math.floor(serial) : serial - Math.floor(serial);
        c.write(
          { kind: 'cells', cells: [{ r: rowId, c: colId, i: { n }, f: { nf: what } }] },
          'Cell',
        );
      },
      // ---- Custom number format (sheet.md "Formatting") ----
      customFormat: (code: string) => {
        fmt({ nf: 'custom', nc: code, dp: null });
      },
      // ---- Rules: dropdowns, checkboxes, validation and format rules, Paint Format ----
      ...sheetRuleActions(c),
      ...sheetOutlineActions(c),
      // ---- Tables (data-tools.md "Tables") ----
      ...sheetTableActions(c),
    };
  }, [c]);
}

export type SheetActions = ReturnType<typeof useSheetActions>;
