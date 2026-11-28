// A spreadsheet's sheet as an image (docs/specs/029-sheets/sheet-store.md "Agents in a spreadsheet", Previews): a Sheet
// framing its cells and charts, from A1 or a range's top-left, within the image limit.
import { describe, expect, it } from 'vitest';
import {
  applySheetWrite,
  emptySheet,
  NOBODY,
  Workbook,
  type CellChange,
  type Sheet,
  type SheetChart,
  type SheetImage,
} from '@livedoc/sheets';
import { planPalette, type ShapeElement } from '@livedoc/document';
import { SHEET_PREVIEW_MAX, spreadsheetSheetImage } from './spreadsheet-sheet-image';

const rows = Array.from({ length: 30 }, (_, i) => `row${String(i).padStart(3, '0')}`);
const cols = Array.from({ length: 8 }, (_, i) => `col${String(i).padStart(3, '0')}`);
const chart = (id: string, r: number, c: number, x: Partial<SheetChart> = {}): SheetChart => ({
  id,
  kind: 'chart',
  type: 'scatter',
  at: { r: rows[r]!, c: cols[c]!, dx: 4, dy: 2 },
  width: 300,
  height: 200,
  range: { r1: rows[0]!, c1: cols[0]!, r2: rows[3]!, c2: cols[1]! },
  ...x,
});

function bookWith(cells: CellChange[], charts: SheetChart[] = [], extra = {}): Workbook {
  let sheet: Sheet = emptySheet({
    id: 'sheetA',
    tabId: 'tabA',
    title: 'Costs',
    layout: { rows, cols, ...extra },
  });
  sheet = applySheetWrite(sheet, { kind: 'cells', cells }, { now: 0, by: NOBODY }).sheet;
  sheet = {
    ...sheet,
    layout: { ...sheet.layout, ...(charts.length ? { objects: charts } : {}) },
  };
  return new Workbook({ sheets: [sheet], locale: 'en-GB' });
}
const cell = (r: number, c: number, n: number): CellChange => ({
  r: rows[r]!,
  c: cols[c]!,
  i: { n },
});
const data = [cell(0, 0, 1), cell(0, 1, 10), cell(1, 0, 2), cell(1, 1, 20), cell(9, 5, 99)];
const tab = { id: 'tabA', name: 'Costs' };

describe('spreadsheetSheetImage', () => {
  it('frames the whole sheet and its charts as a Sheet tab, charts at their cells', () => {
    const wb = bookWith(data, [chart('c1', 0, 3), chart('c2', 0, 4, { range: undefined })]);
    const image = spreadsheetSheetImage(wb, 'sheetA', tab)!;
    const [frame, ...rest] = image.tab.elements as {
      id: string;
      x: number;
      y: number;
      width: number;
    }[];
    const charts = rest.filter((e) => !e.id.startsWith('card-'));
    expect(image.tab).toMatchObject({ id: 'tabA', name: 'Costs', kind: 'sheet' });
    expect((frame as unknown as { planSheet: unknown }).planSheet).toEqual({ sheetId: 'sheetA' });
    expect(charts).toHaveLength(2);
    // D1's corner (three default columns in) and the chart's offsets, inside the Sheet's grid.
    expect(charts[0]!.x).toBeGreaterThan(46 + 3 * 100);
    expect(charts[0]!.y).toBe(40 + 22 + 2);
    expect(frame!.width).toBeGreaterThanOrEqual(charts[1]!.x + 300);
    const model = image.sheets.get('sheetA')!;
    expect(model.cells.some((c) => c.text === '99')).toBe(true);
  });

  // inserted-objects.md "Images over cells": each image an image element at its cell, under the charts.
  it('draws the sheet’s images at their cells under its charts, growing the window to hold them', () => {
    const image = (id: string, r: number, c: number, alt?: string): SheetImage => ({
      id,
      kind: 'image',
      at: { r: rows[r]!, c: cols[c]!, dx: 3, dy: 1 },
      width: 120,
      height: 60,
      imageId: `g-${id}`,
      ...(alt ? { alt } : {}),
    });
    const wb = bookWith(data, [], {
      objects: [
        chart('c1', 0, 3),
        image('logo', 0, 0, 'Logo'),
        image('far', 28, 7),
        { ...image('gone', 0, 0), at: { r: 'x', c: 'y', dx: 0, dy: 0 } },
      ],
    });
    const drawn = spreadsheetSheetImage(wb, 'sheetA', tab)!.tab.elements;
    expect(drawn.map((e) => e.id)).toEqual([
      'preview-sheetA',
      'image-logo',
      'image-far',
      'card-c1',
      'c1',
    ]);
    expect(drawn[1]).toMatchObject({
      type: 'image',
      x: 46 + 3,
      y: 40 + 22 + 1,
      width: 120,
      height: 60,
      imageId: 'g-logo',
      alt: 'Logo',
    });
    expect(drawn[2]).not.toHaveProperty('alt');
    const [frame, , far] = drawn as ShapeElement[];
    expect(frame!.height).toBeGreaterThanOrEqual(far!.y + 60);
    const ranged = spreadsheetSheetImage(wb, 'sheetA', tab, {
      range: { r1: 0, c1: 0, r2: 2, c2: 2 },
    })!;
    expect(ranged.tab.elements.map((e) => e.id)).toEqual(['preview-sheetA', 'image-logo']);
  });

  // inserted-objects.md "Images in a cell": a cell's picture fills its cell's box, kept in proportion and centred
  // (the image element's `contain`), under images over cells and charts.
  it('draws the pictures cells show in their boxes, under the images over cells', () => {
    const pic = (r: number, c: number, id: string, alt?: string): CellChange => ({
      r: rows[r]!,
      c: cols[c]!,
      i: { img: alt ? { id, alt } : { id } },
    });
    const wb = bookWith(
      [
        pic(0, 0, 'g-cow', 'A cow'),
        { r: rows[0]!, c: cols[1]!, i: { f: { t: '@0', r: [{ r1: rows[0]!, c1: cols[0]! }] } } },
        pic(2, 1, 'g-hen'),
      ],
      [],
      {
        merges: [{ r1: rows[2]!, c1: cols[1]!, r2: rows[3]!, c2: cols[2]! }],
        objects: [
          {
            id: 'logo',
            kind: 'image',
            at: { r: rows[0]!, c: cols[0]!, dx: 0, dy: 0 },
            width: 50,
            height: 50,
            imageId: 'g-logo',
          },
        ],
      },
    );
    const image = spreadsheetSheetImage(wb, 'sheetA', tab)!;
    const { colWidths: w, rowHeights: h } = image.sheets.get('sheetA')!;
    const drawn = image.tab.elements;
    expect(drawn.map((e) => e.id)).toEqual([
      'preview-sheetA',
      'cell-picture-0-0',
      'cell-picture-0-1',
      'cell-picture-2-1',
      'image-logo',
    ]);
    expect(drawn[1]).toEqual({
      id: 'cell-picture-0-0',
      type: 'image',
      x: 46,
      y: 62,
      width: w[0]! - 1,
      height: h[0]! - 1,
      imageId: 'g-cow',
      alt: 'A cow',
      borderRadius: 'none',
    });
    expect(drawn[2]).toMatchObject({ x: 46 + w[0]!, imageId: 'g-cow', alt: 'A cow' });
    expect(drawn[3]).toMatchObject({
      x: 46 + w[0]!,
      y: 62 + h[0]! + h[1]!,
      width: w[1]! + w[2]! - 1,
      height: h[2]! + h[3]! - 1,
      imageId: 'g-hen',
    });
    expect(drawn[3]).not.toHaveProperty('alt');
    // A window that cuts a merged picture's cell keeps the picture within it.
    const cut = spreadsheetSheetImage(wb, 'sheetA', tab, {
      range: { r1: 2, c1: 1, r2: 2, c2: 1 },
    })!;
    expect(cut.tab.elements[1]).toMatchObject({
      x: 46,
      y: 62,
      width: w[1]! - 1,
      height: h[2]! - 1,
    });
  });

  it('sits each chart on its card, as the spreadsheet draws it, just behind it', () => {
    const wb = bookWith(data, [chart('c1', 0, 3)]);
    const [, card, drawn] = spreadsheetSheetImage(wb, 'sheetA', tab)!.tab
      .elements as ShapeElement[];
    const paper = planPalette('light');
    expect(card).toMatchObject({
      id: 'card-c1',
      shape: 'square',
      x: drawn!.x,
      y: drawn!.y,
      width: 300,
      height: 200,
      fillColor: paper.surface,
      strokeColor: paper.border,
      strokeWidth: 'thin',
    });
    expect(card!.label ?? '').toBe('');
    expect(drawn!.id).toBe('c1');
  });

  it('draws a range from its top-left, leaving out charts before or past it', () => {
    const wb = bookWith(data, [chart('before', 0, 0), chart('inside', 9, 5), chart('past', 29, 7)]);
    const image = spreadsheetSheetImage(wb, 'sheetA', tab, {
      range: { r1: 9, c1: 5, r2: 12, c2: 6 },
    })!;
    const model = image.sheets.get('sheetA')!;
    expect(model.rowLabels[0]).toBe('10');
    expect(model.colLabels[0]).toBe('F');
    expect(image.tab.elements.map((e) => e.id)).toEqual([
      'preview-sheetA',
      'card-inside',
      'inside',
    ]);
  });

  it('shows a few rows of an empty sheet, keeps within the image limit, and answers null for no sheet', () => {
    const empty = spreadsheetSheetImage(bookWith([]), 'sheetA', tab)!;
    expect((empty.tab.elements[0] as { width: number }).width).toBe(400 + 46);
    const huge = bookWith(
      [],
      [
        chart('big', 0, 0, {
          width: 2000,
          height: 2000,
          at: { r: rows[29]!, c: cols[7]!, dx: 0, dy: 0 },
        }),
      ],
    );
    const capped = spreadsheetSheetImage(huge, 'sheetA', tab)!;
    expect((capped.tab.elements[0] as { height: number }).height).toBeLessThanOrEqual(
      SHEET_PREVIEW_MAX,
    );
    expect(spreadsheetSheetImage(bookWith([]), 'nope', tab)).toBeNull();
  });

  it('skips hidden rows and columns and a chart on a gone cell', () => {
    const wb = bookWith(
      data,
      [chart('gone', 0, 0, { at: { r: 'zzzz', c: cols[0]!, dx: 0, dy: 0 } })],
      {
        hiddenRows: [rows[1]!],
        hiddenCols: [cols[1]!],
      },
    );
    const image = spreadsheetSheetImage(wb, 'sheetA', tab, {
      range: { r1: 0, c1: 0, r2: 2, c2: 2 },
    })!;
    expect(image.tab.elements).toHaveLength(1);
    expect(image.sheets.get('sheetA')!.rowLabels).not.toContain('2');
    // The whole sheet leaves the gone chart out too, and a chart by its columns reads them.
    const whole = bookWith(data, [
      chart('gone', 0, 0, { at: { r: 'zzzz', c: cols[0]!, dx: 0, dy: 0 } }),
      chart('cols', 0, 3, { cols: [cols[1]!] }),
    ]);
    expect(spreadsheetSheetImage(whole, 'sheetA', tab)!.tab.elements.map((e) => e.id)).toEqual([
      'preview-sheetA',
      'card-cols',
      'cols',
    ]);
  });
});
