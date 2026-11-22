// A sheet as the text a CSV or TSV download holds (docs/specs/029-sheets/sheet.md "CSV", files-and-print.md
// "Download"): every row and column up to its last filled cell, each value as shown in the workbook's locale, made
// safe for a spreadsheet to open. One writer for a Plan Sheet's Download CSV, the api's and this browser's.
import { toCsv } from './csv';
import type { Workbook } from './engine/workbook';
import { displayValue } from './number-format';
import type { Sheet } from './sheet';

/** Each row's values as shown, up to the sheet's last filled cell. */
export function shownRows(wb: Workbook, sheet: Sheet): string[][] {
  const ext = wb.extent(sheet.id);
  const rows: string[][] = [];
  for (let r = 0; r < ext.rows; r++) {
    const row: string[] = [];
    for (let c = 0; c < ext.cols; c++) {
      const cell = sheet.cells.get(`${sheet.layout.rows[r]}:${sheet.layout.cols[c]}`);
      row.push(displayValue(wb.value(sheet.id, r, c), cell?.format, wb.locale).text);
    }
    rows.push(row);
  }
  return rows;
}

/** The sheet as a download's CSV (or TSV, `sep` a tab), injection-safe. */
export function sheetText(wb: Workbook, sheet: Sheet, sep: ',' | '\t' = ','): string {
  return toCsv(shownRows(wb, sheet), { safe: true, sep });
}
