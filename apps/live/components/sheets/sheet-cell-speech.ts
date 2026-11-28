// What a screen reader hears of the grid's cells (docs/specs/029-sheets/grid-and-editing.md "Accessibility"): a
// cell's value as drawn, and Read Row and Read Column, Google's Verbalize to Screen Reader. Pure but for reading the
// workbook, so the words are tested without a DOM.
import { drawnFormat, type DrawnPivots } from '@/lib/spreadsheet/pivot-sliced';
import {
  cellKey,
  columnLetters,
  displayValue,
  formatA1,
  imageHost,
  type CellImage,
  type CellPicture,
  type Sheet,
  type Sparkline,
  type Workbook,
} from '@livedoc/sheets';
import { mergeAt, type Geometry } from './sheet-geometry';

/** The most cells Read Row and Read Column say (D135). */
export const READ_CELLS_MAX = 50;

const SPARKLINE_KINDS = {
  line: 'Line',
  column: 'Column',
  winloss: 'Win/loss',
  bar: 'Bar',
} as const;

/** What an IMAGE's picture is called, drawn or spoken. */
export const imageLabel = (image: CellImage) => `Image from ${imageHost(image)}`;

/** What a cell's gallery picture is called: its alt text, else "Image". */
export const pictureLabel = (picture: CellPicture) => picture.alt || 'Image';

/** What a SPARKLINE's chart is called, drawn or spoken. */
export const sparklineLabel = (chart: Sparkline) =>
  `${SPARKLINE_KINDS[chart.kind]} sparkline of ${chart.values.length} values`;

/**
 * A cell's value as the grid draws it, in its own format: 12% and a date, never 0.12 and a serial number; a picture
 * or a sparkline by what it is, as its value is empty text.
 */
export function cellSpokenValue(
  sheet: Sheet,
  workbook: Workbook,
  locale: string,
  r: number,
  c: number,
  // The pivot tables this person's slicers filter, read as drawn (D629).
  drawn?: DrawnPivots | null,
): string {
  const image = workbook.imageOf(sheet.id, r, c);
  if (image) return imageLabel(image);
  // A gallery picture in the cell by its alt text (inserted-objects.md "Accessibility").
  const picture = workbook.pictureOf(sheet.id, r, c);
  if (picture) return pictureLabel(picture);
  const chart = workbook.sparklineOf(sheet.id, r, c);
  if (chart) return sparklineLabel(chart);
  const format = sheet.cells.get(cellKey(sheet.layout.rows[r]!, sheet.layout.cols[c]!))?.format;
  const sliced = drawn?.at(r, c);
  if (sliced)
    return displayValue(sliced.v, drawnFormat(drawn, workbook, sheet.id, r, c, format), locale)
      .text;
  return displayValue(workbook.value(sheet.id, r, c), format, locale).text;
}

export type LineReading = {
  axis: 'r' | 'c';
  active: { r: number; c: number };
  // Left out of the reading: a hidden line, or a cell a merge covers.
  skipped: (r: number, c: number) => boolean;
  value: (r: number, c: number) => string;
};

/** Read Row or Read Column: the active cell's line from its start to the active cell, each cell by address. */
export function readLine({ axis, active, skipped, value }: LineReading): string {
  const end = axis === 'r' ? active.c : active.r;
  const said: string[] = [];
  let more = 0;
  for (let i = 0; i <= end; i++) {
    const r = axis === 'r' ? active.r : i;
    const c = axis === 'r' ? i : active.c;
    if (skipped(r, c)) continue;
    if (said.length === READ_CELLS_MAX) {
      more++;
      continue;
    }
    said.push(`${formatA1(r, c)} ${value(r, c) || 'blank'}`);
  }
  const head = axis === 'r' ? `Row ${active.r + 1}` : `Column ${columnLetters(active.c)}`;
  return `${head}: ${said.join(', ')}${more ? `, and ${more.toLocaleString('en-GB')} more` : ''}`;
}

/** Read Row or Read Column of a sheet as drawn: hidden lines and the cells a merge covers left out. */
export function readSheetLine(
  view: { sheet: Sheet; workbook: Workbook; locale: string; geometry: Geometry },
  axis: 'r' | 'c',
  active: { r: number; c: number },
): string {
  const g = view.geometry;
  return readLine({
    axis,
    active,
    skipped: (r, c) => {
      if (g.hiddenRow(r) || g.hiddenCol(c)) return true;
      const merge = mergeAt(g, r, c);
      return !!merge && (merge.r1 !== r || merge.c1 !== c);
    },
    value: (r, c) => cellSpokenValue(view.sheet, view.workbook, view.locale, r, c),
  });
}
