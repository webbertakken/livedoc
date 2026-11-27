// Excel's own bounds on what an XLSX file holds (docs/specs/029-sheets/standard-mapping.md "Values in XLSX", D89): a
// cell's text, a formula's length and the last column. The writer and the conversion's losses decide each cell here,
// so what the dialog lists is what the file leaves out.
import { dummyFunction, toExcelFormula, type CachedLiteral } from './excel-formula';
import type { FileValue } from './workbook-file';

/** A cell's longest text in Excel (Excel's specifications and limits). */
export const XLSX_TEXT_MAX = 32_767;

/** A formula's longest text in Excel, as written (Excel's specifications and limits). */
export const XLSX_FORMULA_MAX = 8_192;

/** How a formula is written in XLSX: in Excel's grammar, wrapped by S5's convention, or as its value alone. */
export type XlsxFormula =
  { k: 'excel'; text: string } | { k: 'wrapped'; text: string } | { k: 'value' };

export function cachedLiteral(value: FileValue | undefined): CachedLiteral | undefined {
  if (!value) return undefined;
  return value.k === 'e' ? { e: value.v } : value.v;
}

/**
 * A formula as Excel holds it, its sheet names as `renamed` maps them, the names of `tables` (upper case) as tables,
 * its cached value inside a wrapping.
 */
export function xlsxFormula(
  formula: string,
  value: FileValue | undefined,
  renamed: ReadonlyMap<string, string> = new Map(),
  tables: ReadonlySet<string> = new Set(),
): XlsxFormula {
  const excel = toExcelFormula(formula, renamed, tables);
  if (excel !== null)
    return excel.length <= XLSX_FORMULA_MAX ? { k: 'excel', text: excel } : { k: 'value' };
  const wrapped = dummyFunction(formula, cachedLiteral(value));
  return wrapped.length <= XLSX_FORMULA_MAX ? { k: 'wrapped', text: wrapped } : { k: 'value' };
}

/** Text cut to Excel's length, never through a surrogate pair; the same text when it fits. */
export function cutXlsxText(text: string): string {
  if (text.length <= XLSX_TEXT_MAX) return text;
  const last = text.charCodeAt(XLSX_TEXT_MAX - 1);
  const splitsPair = last >= 0xd800 && last <= 0xdbff;
  return text.slice(0, splitsPair ? XLSX_TEXT_MAX - 1 : XLSX_TEXT_MAX);
}
