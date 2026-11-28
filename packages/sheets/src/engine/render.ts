// A sheet's top-left window as plain data: what images, thumbnails,
// PDFs and api or MCP renders draw, with no DOM. Only the cells inside the window are worked out.
import { sheetLink } from '../cell-link';
import { columnLetters } from '../address';
import { colWidth, layoutIndex, posRangeOf } from '../layout';
import { cellLines, cellTurn, rowHeights } from '../row-fit';
import { measuredFont } from '../text/text-measure';
import { displayValue } from '../number-format';
import { cellKey, type Border, type CellFormat } from '../sheet';
import { Workbook } from './workbook';
import type { CardSource } from '../cards';
import { sheetFromJson, type SheetJson } from '../sheet-json';
import { checkState, hasValidation, optionFor, validationRuleAt } from '../rules/validation';
import { formatRuleStyle } from '../rules/format-rules';
import { bandingFillAt } from '../rules/bandings';
import { resolveColour, themedFormat } from '../themes/spreadsheet-theme';
import { isArray, isError, scalarOf } from '../formula/values';
import { sparklineShapes, type SparkShape } from '../sparkline/sparkline-shapes';

type RenderCell = {
  r: number; // index into the model's rows
  c: number; // index into the model's columns
  text: string;
  // The text as it is drawn when it takes more than one line (sheet.md "Row height"): wrapped, or broken where its
  // line breaks are.
  lines?: string[];
  align: 'l' | 'c' | 'r';
  valign: 't' | 'm' | 'b';
  error?: true;
  bold?: true;
  italic?: true;
  underline?: true;
  strike?: true;
  color?: string;
  fill?: string;
  // A font id, resolved by the renderer.
  font?: string;
  // A number, a date or a time: drawn in tabular figures (sheet.md "The grid").
  numeric?: true;
  size?: number;
  wrap?: 'o' | 'w' | 'c';
  // Turned text (formatting.md "Alignment, wrapping, rotation"): its angle, counterclockwise, and the box it turns to,
  // placed in the cell by its alignment. Stacked text is upright, its characters as lines.
  turn?: { deg: number; w: number; h: number };
  rowSpan?: number;
  colSpan?: number;
  borders?: { t?: Border; r?: Border; b?: Border; l?: Border };
  // A dropdown drawn as a chip (data-validation.md "Drawing"): its value on a pill in its option's colour, if any.
  chip?: { color?: string };
  // A dropdown drawn with an arrow at its right instead.
  arrow?: true;
  // Where the cell's link opens (Workbook.linkTargetOf): a web or email address, or a sheet of this workbook as its
  // link (`#gid=`); drawn as a link, underlined in the sheet's accent.
  link?: string;
  // A SPARKLINE's chart (Workbook.sparklineOf), its shapes placed in the cell's box (charts.md "Sparklines").
  spark?: SparkShape[];
};

export type SheetRenderModel = {
  title: string;
  colWidths: number[];
  rowHeights: number[];
  colLabels: string[];
  rowLabels: string[];
  frozenRows: number;
  frozenCols: number;
  cells: RenderCell[];
  // The font the cells were measured in, which a cell with no font of its own is drawn in (sheet.md "Row height").
  font: string;
  // The sheet's look (Sheet Settings): gridlines and headers left out.
  hideGrid?: true;
  hideHeaders?: true;
};

// The visible positions from `start`, filling `extent` pixels (at least one).
function visible(
  ids: readonly string[],
  hidden: ReadonlySet<string>,
  size: (id: string) => number,
  extent: number,
  start: number,
): number[] {
  const out: number[] = [];
  let used = 0;
  for (let i = start; i < ids.length && (used < extent || out.length === 0); i++) {
    if (hidden.has(ids[i]!)) continue;
    out.push(i);
    used += size(ids[i]!);
  }
  return out;
}

// `font` is the tab's font id: what a cell with no font of its own is measured in (row-fit.ts). `origin` is the
// top-left position the window starts at (a range's preview, docs/specs/029-sheets/sheet-store.md "Agents in a
// spreadsheet"); A1 by default, frozen rows and columns then drawn as frozen.
export function renderWindow(
  wb: Workbook,
  sheetId: string,
  window: { width: number; height: number },
  locale: string,
  font?: string,
  origin: { r: number; c: number } = { r: 0, c: 0 },
): SheetRenderModel | undefined {
  const sheet = wb.sheet(sheetId);
  if (!sheet) return undefined;
  const { layout } = sheet;
  const ix = layoutIndex(layout);
  const heightOf = rowHeights(wb, sheetId, font);
  const rows = visible(layout.rows, ix.hiddenRows, heightOf, window.height, origin.r);
  const cols = visible(
    layout.cols,
    ix.hiddenCols,
    (id) => colWidth(layout, id),
    window.width,
    origin.c,
  );
  const rowAt = new Map(rows.map((r, i) => [r, i]));
  const colAt = new Map(cols.map((c, i) => [c, i]));
  const covered = new Set<string>();
  const spans = new Map<string, { rowSpan: number; colSpan: number }>();
  for (const m of layout.merges ?? []) {
    const p = posRangeOf(layout, m);
    if (!p) continue;
    spans.set(`${p.r1},${p.c1}`, { rowSpan: p.r2 - p.r1 + 1, colSpan: p.c2 - p.c1 + 1 });
    for (let r = p.r1; r <= p.r2; r++)
      for (let c = p.c1; c <= p.c2; c++) if (r !== p.r1 || c !== p.c1) covered.add(`${r},${c}`);
  }
  // A cell's width or height in pixels, merged cells' summed.
  const spanSize = (
    r: number,
    c: number,
    span: { rowSpan: number; colSpan: number } | undefined,
    axis: 'row' | 'col',
  ) => {
    let size = 0;
    if (axis === 'col')
      for (let k = c; k < c + (span?.colSpan ?? 1); k++) size += colWidth(layout, layout.cols[k]!);
    else for (let k = r; k < r + (span?.rowSpan ?? 1); k++) size += heightOf(layout.rows[k]!);
    return size;
  };
  const cells: RenderCell[] = [];
  for (const r of rows)
    for (const c of cols) {
      if (covered.has(`${r},${c}`)) continue;
      const cell = sheet.cells.get(cellKey(layout.rows[r]!, layout.cols[c]!));
      const value = wb.value(sheetId, r, c);
      const own: CellFormat = wb.shownFormat(sheetId, r, c, cell?.format) ?? {};
      let shown = displayValue(value, own, locale);
      // A met format rule's style draws over the cell's own (conditional-formatting.md).
      const style = layout.formatRules?.length
        ? formatRuleStyle(wb, sheetId, r, c, value, shown.text)
        : null;
      const met: CellFormat = style ? { ...own, ...style } : own;
      // Alternating colours shade under a cell's own fill and a met rule's (formatting.md "Alternating colours").
      const band = !met.bg && layout.bands?.length ? bandingFillAt(layout, r, c) : null;
      // Theme colours drawn in the workbook's theme (formatting.md "Themes").
      const f: CellFormat = themedFormat(band ? { ...met, bg: band } : met, wb.theme)!;
      // A checkbox draws as a box, a chip on its option's colour (data-validation.md "Drawing").
      const rule = hasValidation(layout) ? validationRuleAt(layout, r, c) : null;
      const scalar = isArray(value) ? scalarOf(value) : value;
      let chip: { color?: string } | undefined;
      if (rule?.is === 'check') {
        const box = isError(scalar) ? undefined : checkState(rule, scalar);
        if (box !== undefined) shown = { text: box ? '☑' : '☐', align: 'c', kind: 'text' };
      } else if (
        (rule?.is === 'list' || rule?.is === 'range') &&
        !rule.show &&
        scalar !== null &&
        scalar !== '' &&
        !isError(scalar)
      ) {
        const color = rule.is === 'list' ? optionFor(rule, scalar)?.c : undefined;
        chip = color ? { color } : {};
      }
      const arrow = (rule?.is === 'list' || rule?.is === 'range') && rule.show === 'arrow';
      const span = spans.get(`${r},${c}`);
      const chart = wb.sparklineOf(sheetId, r, c);
      const spark = chart
        ? sparklineShapes(chart, spanSize(r, c, span, 'col'), spanSize(r, c, span, 'row'), f.fc)
        : undefined;
      if (!shown.text && !spark?.length && !arrow && !f.bg && !f.bt && !f.br && !f.bb && !f.bl)
        continue;
      const out: RenderCell = {
        r: rowAt.get(r)!,
        c: colAt.get(c)!,
        text: shown.text,
        align: f.ha ?? shown.align,
        valign: f.va ?? 'm',
      };
      const turn = shown.text ? cellTurn(wb, sheetId, r, c, shown.text, font) : null;
      if (turn) {
        if (turn.lines.length > 1) out.lines = [...turn.lines];
        else out.text = turn.lines[0] ?? '';
        if (turn.deg) out.turn = { deg: turn.deg, w: turn.w, h: turn.h };
      } else if (shown.kind === 'text' && (f.wr === 'w' || shown.text.includes('\n'))) {
        const lines = cellLines(wb, sheetId, r, c, shown.text, font);
        if (lines.length > 1) out.lines = [...lines];
        else out.text = lines[0] ?? '';
      }
      if (shown.kind === 'error') out.error = true;
      if (shown.kind === 'number') out.numeric = true;
      if (f.b) out.bold = true;
      if (f.i) out.italic = true;
      if (f.u) out.underline = true;
      // A cell's link or a HYPERLINK draws as a link, wherever its sheet is drawn (formulas.md "Text", D637).
      const target = shown.text ? wb.linkTargetOf(sheetId, r, c) : null;
      if (target) {
        out.link = target.k === 'web' ? target.href : sheetLink(target.sheetId, target.range);
        out.underline = true;
      }
      if (f.st) out.strike = true;
      // A met rule's colour over the code's section's, over the cell's own (formatting.md "Number formats", D192).
      const colour =
        resolveColour(style?.fc, wb.theme) ?? shown.colour ?? resolveColour(own.fc, wb.theme);
      if (colour) out.color = colour;
      if (f.bg) out.fill = f.bg;
      if (chip) out.chip = chip;
      if (arrow) out.arrow = true;
      if (spark?.length) out.spark = spark;
      if (f.ff) out.font = f.ff;
      if (f.fs) out.size = f.fs;
      if (f.wr) out.wrap = f.wr;
      if (span) {
        out.rowSpan = span.rowSpan;
        out.colSpan = span.colSpan;
      }
      if (f.bt || f.br || f.bb || f.bl)
        out.borders = {
          ...(f.bt ? { t: f.bt } : {}),
          ...(f.br ? { r: f.br } : {}),
          ...(f.bb ? { b: f.bb } : {}),
          ...(f.bl ? { l: f.bl } : {}),
        };
      cells.push(out);
    }
  return {
    title: sheet.title,
    colWidths: cols.map((c) => colWidth(layout, layout.cols[c]!)),
    rowHeights: rows.map((r) => heightOf(layout.rows[r]!)),
    colLabels: cols.map((c) => columnLetters(c)),
    rowLabels: rows.map((r) => String(r + 1)),
    // A window that starts past A1 shows no frozen panes: its first rows and columns are the range's.
    frozenRows: origin.r > 0 ? 0 : Math.min(layout.frozenRows ?? 0, rows.length),
    frozenCols: origin.c > 0 ? 0 : Math.min(layout.frozenCols ?? 0, cols.length),
    cells,
    font: measuredFont(font),
    ...(layout.showGrid === false ? { hideGrid: true as const } : {}),
    ...(layout.showHeaders === false ? { hideHeaders: true as const } : {}),
  };
}

// The grid a sheet's cells fill, in px (docs/specs/029-sheets/sheet.md "Exports and images"): its visible rows and
// columns through the last that holds an input, a fill, a border, a merge or a spilled or pivot table value, and one
// more of each so the grid reads as going on; null for a sheet with nothing in it. A Sheet tab's image grows its Sheet
// to this, as the tab shows it.
export function sheetContentSize(
  wb: Workbook,
  sheetId: string,
  font?: string,
): { width: number; height: number } | null {
  const sheet = wb.sheet(sheetId);
  if (!sheet) return null;
  const { layout } = sheet;
  const ix = layoutIndex(layout);
  let lastRow = -1;
  let lastCol = -1;
  for (const [key, cell] of sheet.cells) {
    const f = cell.format;
    if (!cell.input && !f?.bg && !f?.bt && !f?.br && !f?.bb && !f?.bl) continue;
    const [r, c] = key.split(':');
    lastRow = Math.max(lastRow, ix.rowPos.get(r!) ?? -1);
    lastCol = Math.max(lastCol, ix.colPos.get(c!) ?? -1);
  }
  for (const m of layout.merges ?? []) {
    const p = posRangeOf(layout, m);
    if (!p) continue;
    lastRow = Math.max(lastRow, p.r2);
    lastCol = Math.max(lastCol, p.c2);
  }
  const shown = wb.shownExtent(sheetId);
  lastRow = Math.max(lastRow, shown.rows - 1);
  lastCol = Math.max(lastCol, shown.cols - 1);
  if (lastRow < 0) return null;
  const span = (
    ids: readonly string[],
    hidden: ReadonlySet<string>,
    last: number,
    size: (id: string) => number,
  ) => {
    let px = 0;
    for (let i = 0; i <= Math.min(last + 1, ids.length - 1); i++)
      if (!hidden.has(ids[i]!)) px += size(ids[i]!);
    return px;
  };
  return {
    width: span(layout.cols, ix.hiddenCols, lastCol, (id) => colWidth(layout, id)),
    height: span(layout.rows, ix.hiddenRows, lastRow, rowHeights(wb, sheetId, font)),
  };
}

// The chrome around the grid a static render draws (packages/document svg-render-plan-sheet.ts).
const STATIC_HEADER_H = 40 + 22;
const STATIC_ROW_HEAD_W = 46;

type SheetFrame = { sheetId: string; width: number; height: number };

// Every Sheet element's window on a tab, for an image, a thumbnail or an api or MCP render: one workbook over the
// tab's sheets, each element's window the size of its grid area.
export function renderModelsForTab(
  sheets: readonly SheetJson[],
  frames: readonly SheetFrame[],
  opts: { locale?: string; cards?: CardSource | null; now?: () => number; font?: string } = {},
): Map<string, SheetRenderModel> {
  const out = new Map<string, SheetRenderModel>();
  if (frames.length === 0 || sheets.length === 0) return out;
  const wb = new Workbook({
    sheets: sheets.map(sheetFromJson),
    locale: opts.locale ?? 'en-GB',
    cards: opts.cards ?? null,
    ...(opts.now ? { now: opts.now } : {}),
  });
  for (const f of frames) {
    if (out.has(f.sheetId)) continue;
    const model = renderFrameWindow(wb, f, opts.font);
    if (model) out.set(f.sheetId, model);
  }
  return out;
}

// One Sheet element's window, from a workbook already holding its sheet (the editor's sheet store, for its images:
// docs/specs/026-plan/plan-tabs.md "Export"): the cells that fit its grid area, inside the static render's chrome.
export function renderFrameWindow(
  wb: Workbook,
  frame: SheetFrame,
  font?: string,
): SheetRenderModel | undefined {
  return renderWindow(
    wb,
    frame.sheetId,
    {
      width: Math.max(1, frame.width - STATIC_ROW_HEAD_W),
      height: Math.max(1, frame.height - STATIC_HEADER_H),
    },
    wb.locale,
    font,
  );
}

// The Sheet elements of a tab, as frames (structural: any element list).
export function sheetFramesOf(
  elements: readonly {
    type?: string;
    shape?: string;
    width?: number;
    height?: number;
    planSheet?: { sheetId?: string };
  }[],
): SheetFrame[] {
  const out: SheetFrame[] = [];
  for (const el of elements)
    if (el.shape === 'plan-sheet' && el.planSheet?.sheetId)
      out.push({ sheetId: el.planSheet.sheetId, width: el.width ?? 960, height: el.height ?? 560 });
  return out;
}
