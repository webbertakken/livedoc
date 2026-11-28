// One sheet's cells for an agent (docs/specs/029-sheets/sheet-store.md "Agents", MCP read_sheet and `sheet get`): a
// range's non-empty cells by A1, each with its input as typed (a formula with its =), the value the engine works
// out and what the cell shows, plus the layout facts a reader needs (freeze, merges, filter). Bounded twice: the
// range by AGENT_READ_CELLS_MAX cells, the answer by SHEET_READ_CHARS_MAX characters.
import type { ApiClient } from '@livedoc/api-client';
import {
  formatA1,
  formatRange,
  parseRangeText,
  posRangeOf,
  readRange,
  ruleMessage,
  validationRuleAt,
  valueInvalid,
  workbookRuleChecks,
  type SheetLayout,
  cellLinkText,
} from '@livedoc/sheets';
import { readSheetsState, resolveSheet, workbookFor, type SheetRefusal } from './sheet-state';
import { rulesRead } from './sheet-rule-change';
import { chartsRead, type ChartRead } from './sheet-chart-objects';
import { pivotsRead, type PivotRead } from './sheet-pivot-objects';
import { imagesRead, type ImageRead } from './sheet-image-objects';

// The most characters of cells one read answers with (docs/specs/029-sheets/sheet-store.md, Defaults): about
// 25,000 tokens, so
// a read fits beside the rest of a conversation.
export const SHEET_READ_CHARS_MAX = 100_000;

export interface ReadCell {
  at: string;
  // As typed: a formula with its =, a number unformatted, a boolean in capitals; empty for a spilled cell.
  input: string;
  // What the engine works out: a number (dates and times as serial numbers), text, a boolean, an error as its
  // text (#REF!), or null.
  value: string | number | boolean | null;
  // What the cell shows, in its number format.
  display: string;
  // A value its validation rule does not allow (a Warn rule, a formula, a value from before the rule): why.
  invalid?: string;
  // Its own link (inserted-objects.md "Links, agents"): an address, or a range or sheet of this spreadsheet by name.
  link?: string;
  // Its note (review.md "Notes").
  note?: string;
}

export interface SheetRead {
  ok: true;
  sheetId: string;
  title: string;
  tabId: string;
  range: string;
  // Rows and columns in use (to the last cell with an input).
  rows: number;
  cols: number;
  cells: ReadCell[];
  truncated: boolean;
  note?: string;
  frozen: { rows: number; cols: number };
  merges: string[];
  filter: string | null;
  // Validation and format rules, in words (data-validation.md, conditional-formatting.md "Agents").
  validation: ReturnType<typeof rulesRead>['validation'];
  conditionalFormats: ReturnType<typeof rulesRead>['conditionalFormats'];
  charts?: ChartRead[];
  // A spreadsheet's sheet: its images over cells (inserted-objects.md "Agents").
  images?: ImageRead[];
  // A spreadsheet's sheet's pivot tables (pivot-tables.md "The model"), when it holds any.
  pivots?: PivotRead[];
}

function imagesOf(wb: Parameters<typeof imagesRead>[0], id: string): { images?: ImageRead[] } {
  const images = imagesRead(wb, id);
  return images.length ? { images } : {};
}

function pivotsOf(wb: Parameters<typeof pivotsRead>[0], id: string): { pivots?: PivotRead[] } {
  const pivots = pivotsRead(wb, id);
  return pivots.length ? { pivots } : {};
}

function layoutFacts(layout: SheetLayout) {
  const a1 = (ids: Parameters<typeof posRangeOf>[1]) => {
    const pos = posRangeOf(layout, ids);
    return pos ? formatRange(pos) : null;
  };
  return {
    frozen: { rows: layout.frozenRows ?? 0, cols: layout.frozenCols ?? 0 },
    merges: (layout.merges ?? []).map(a1).filter((m): m is string => m !== null),
    filter: layout.filter ? a1(layout.filter) : null,
  };
}

export async function readSheet(
  api: ApiClient,
  documentId: string,
  input: { sheet: string; range?: string },
): Promise<SheetRead | SheetRefusal> {
  const state = await readSheetsState(api, documentId);
  const found = resolveSheet(state.sheets, input.sheet);
  if (!found.ok) return found;
  const { id, tabId, title } = found.sheet;
  const wb = await workbookFor(api, documentId, state, tabId);
  const read = readRange(wb, id, input.range);
  if (!read.ok)
    return {
      ok: false,
      code: read.error,
      message: `"${input.range}" is not a cell or range in A1 form ("B4", "A1:D20").`,
    };
  const start = parseRangeText(read.range)!;
  const layout = wb.sheet(id)!.layout;
  const cells: ReadCell[] = [];
  let chars = 0;
  let cut: string | null = null;
  rows: for (const [i, row] of read.rows.entries()) {
    for (const [j, cell] of row.entries()) {
      const note = wb.cellNoteOf(id, start.r1 + i, start.c1 + j);
      if (cell.input === '' && (cell.value === null || cell.value === '') && note === null)
        continue;
      const at = formatA1(start.r1 + i, start.c1 + j);
      const out: ReadCell = {
        at,
        input: cell.input,
        // readRange answers an error as its text, so a value is never an error object.
        value: cell.value as ReadCell['value'],
        display: cell.display,
      };
      const ln = wb.cellLinkOf(id, start.r1 + i, start.c1 + j);
      if (ln !== null) out.link = cellLinkText(ln, (sheetId) => wb.sheet(sheetId)?.title);
      if (note !== null) out.note = note;
      const rule = layout.rules?.length
        ? validationRuleAt(layout, start.r1 + i, start.c1 + j)
        : null;
      if (rule) {
        const ctx = { locale: 'en-GB', layout, ...workbookRuleChecks(wb, id) };
        const at = { r: start.r1 + i, c: start.c1 + j };
        if (valueInvalid(rule, wb.value(id, at.r, at.c), cell.display, ctx, at))
          out.invalid = ruleMessage(rule, ctx);
      }
      chars += JSON.stringify(out).length;
      if (chars > SHEET_READ_CHARS_MAX) {
        cut = at;
        break rows;
      }
      cells.push(out);
    }
  }
  const extent = wb.shownExtent(id);
  const lastRow = start.r1 + read.rows.length;
  const note = cut
    ? `Stopped at ${cut}, the most one read answers with: read on with a range from ${cut}.`
    : read.truncated
      ? `Stopped after row ${lastRow}, the most cells one read answers with: read on with a range from row ${lastRow + 1}.`
      : undefined;
  return {
    ok: true,
    sheetId: id,
    title,
    tabId,
    range: read.range,
    rows: extent.rows,
    cols: extent.cols,
    cells,
    truncated: cut !== null || read.truncated,
    ...(note ? { note } : {}),
    ...layoutFacts(wb.sheet(id)!.layout),
    ...rulesRead(wb, id),
    // A spreadsheet's sheet holds its own charts (sheet-store.md "Built for agents in a spreadsheet").
    ...(state.workbook ? { charts: chartsRead(wb, id) } : {}),
    ...(state.workbook ? pivotsOf(wb, id) : {}),
    ...(state.workbook ? imagesOf(wb, id) : {}),
  };
}
