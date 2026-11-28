// Converting a spreadsheet to the other standard (docs/specs/029-sheets/files-and-print.md "Converting", D87, D88):
// what the new format's file cannot hold that the old one could, listed before it runs. Converting changes the file
// format alone, so each loss is what every file written in the new format leaves out; the writers decide each cell
// through the same functions (xlsx-bounds.ts, open-formula.ts), so the list is what the file does.
import { callsOf } from '../formula/ast';
import type { FormulaMeaning } from '../formula/meaning';
import { parseFormula } from '../formula/parse';
import type { Sheet } from '../sheet';
import { WorkbookRecord, type WorkbookFormat } from '../workbook-record';
import { FILE_LAST_COL } from './a1-text';
import { GOOGLE_ONLY_FUNCTIONS } from './odf-function-names';
import { odsFormulaOf } from './ods-tables';
import type { FileCell, WorkbookFile } from './workbook-file';
import { fileKept } from './kept-anchors';
import { simplifiedElsewhere, type SimplifiedFeature } from './file-validation';
import { PIVOT_SIMPLIFIED, pivotSimplified, type PivotSimplified } from './file-pivots';
import {
  keptKinds,
  keptStandardOf,
  type KeptContent,
  type KeptKind,
  type StoredAt,
} from './kept-content';
import { answersDiffering, workbookFileFor } from './write-workbook';
import { XLSX_TEXT_MAX, xlsxFormula } from './xlsx-bounds';
import { xlsxLacks } from './xlsx-function-names';
import { excelNames } from './xlsx-write';
import { slicerTableAt } from './xlsx-slicers';
import { xlsxTablesOf } from './xlsx-tables';
import { excelRefuses } from './file-names';
import { protectionsElsewhere, type ProtectionSimplified } from './file-protections';

/** What a formula becomes in a format's file: calculated there, kept for LiveDoc but not calculated, or a value. */
export type FormulaFate = 'native' | 'uncalculated' | 'unwritten';

const RANK: Readonly<Record<FormulaFate, number>> = { native: 0, uncalculated: 1, unwritten: 2 };

/** A loss of converting, one a kind, counted (D88). */
export type ConversionLoss =
  // Named functions an OpenDocument file cannot hold (standard-mapping.md "Named functions in the file"), listed first.
  | { k: 'functions_left'; count: number; names: string[] }
  // Named ranges Excel refuses (standard-mapping.md "Named ranges in the file", D344).
  | { k: 'names_left'; count: number; names: string[] }
  | { k: 'sheet_renamed'; count: number; names: { from: string; to: string }[] }
  // `functions`: the functions the new format's apps lack, none when the reason is another (an array literal).
  | { k: 'formula_uncalculated'; count: number; functions: string[] }
  | { k: 'formula_unwritten'; count: number }
  | { k: 'text_cut'; count: number }
  | { k: 'columns_cut'; count: number; sheets: string[] }
  // Formulas calling a function the spreadsheet's meaning and the new format's standard answer differently (D100).
  | { k: 'answers_differ'; count: number; functions: string[] }
  // Validation rules other apps hold more simply (standard-mapping.md "Validation in the file"), and what they lose.
  | { k: 'validation_simplified'; count: number; features: SimplifiedFeature[] }
  // Protections other apps hold more simply, and file passwords the new format cannot carry (standard-mapping.md
  // "Protection in the file", D351).
  | { k: 'protections_simplified'; count: number; features: ProtectionSimplified[] }
  | { k: 'protection_passwords_left'; count: number }
  // Pivot tables other apps hold more simply (standard-mapping.md "Pivot tables in the file", D606), and what they lose.
  | { k: 'pivots_simplified'; count: number; features: PivotSimplified[] }
  // Filter views an OpenDocument file cannot hold (standard-mapping.md "Filters in the file").
  | { k: 'filter_views_left'; count: number }
  // Slicers an OpenDocument file cannot hold, and those Excel does not see (not over a table exactly).
  | { k: 'slicers_left'; count: number }
  | { k: 'slicers_unseen'; count: number }
  // What was kept from the file, which a file of the other standard leaves behind (standard-mapping.md "Unknown
  // content"): counted, its kinds the most common first.
  | { k: 'kept'; count: number; kinds: KeptKind[] };

export type ConversionLossKind = ConversionLoss['k'];

/** What a workbook converted to `to` from `from` loses. */
export type WorkbookConversion = {
  from: WorkbookFormat;
  to: WorkbookFormat;
  losses: ConversionLoss[];
};

/** The format a conversion goes to: Excel's for an ODF workbook, OpenDocument's package for an XLSX one. */
export function convertedFormat(format: WorkbookFormat): WorkbookFormat {
  return format === 'xlsx' ? 'ods' : 'xlsx';
}

const isXlsx = (format: WorkbookFormat) => format === 'xlsx';

/** The functions a formula calls that a format's apps lack (upper case); none for a formula that does not parse. */
export function lackingFunctions(formula: string, format: WorkbookFormat): string[] {
  const parsed = parseFormula(formula);
  if (!parsed.ok) return [];
  const lacks = isXlsx(format) ? xlsxLacks : (name: string) => GOOGLE_ONLY_FUNCTIONS.has(name);
  return [...callsOf(parsed.ast)].filter(lacks);
}

/** What a formula cell becomes in a format's file. */
export function formulaFate(
  cell: FileCell & { formula: string },
  format: WorkbookFormat,
): FormulaFate {
  if (isXlsx(format)) {
    const plan = xlsxFormula(cell.formula, cell.value).k;
    return plan === 'excel' ? 'native' : plan === 'wrapped' ? 'uncalculated' : 'unwritten';
  }
  if (odsFormulaOf(cell) === null) return 'unwritten';
  return lackingFunctions(cell.formula, format).length > 0 ? 'uncalculated' : 'native';
}

type Tally = { uncalculated: number; functions: Set<string>; unwritten: number; texts: number };

function tallyCell(cell: FileCell, from: WorkbookFormat, to: WorkbookFormat, tally: Tally): void {
  if (isXlsx(to) && cell.value?.k === 's' && cell.value.v.length > XLSX_TEXT_MAX) tally.texts++;
  if (cell.formula === undefined) return;
  const formula = { ...cell, formula: cell.formula };
  const fate = formulaFate(formula, to);
  if (RANK[fate] <= RANK[formulaFate(formula, from)]) return;
  if (fate === 'unwritten') {
    tally.unwritten++;
    return;
  }
  tally.uncalculated++;
  for (const name of lackingFunctions(cell.formula, to)) tally.functions.add(name);
}

/**
 * What a workbook's file loses going from `from` to `to`, the spreadsheet having `meaning`: nothing within one
 * standard.
 */
export function conversionLosses(
  file: WorkbookFile,
  from: WorkbookFormat,
  to: WorkbookFormat,
  meaning: FormulaMeaning = 'google',
): ConversionLoss[] {
  if (WorkbookRecord.sameStandard(from, to)) return [];
  const tally: Tally = { uncalculated: 0, functions: new Set(), unwritten: 0, texts: 0 };
  const wide: string[] = [];
  for (const sheet of file.sheets) {
    let cut = false;
    for (const cell of sheet.cells) {
      if (isXlsx(to) && cell.c >= FILE_LAST_COL) cut = true;
      else tallyCell(cell, from, to, tally);
    }
    if (cut) wide.push(sheet.name);
  }
  const renamed = isXlsx(to) ? excelNames(file.sheets, []) : new Map<string, string>();
  const names = [...renamed].map(([was, now]) => ({ from: was, to: now }));
  const losses: ConversionLoss[] = [];
  const functions = isXlsx(to) ? [] : (file.functions ?? []).map((fn) => fn.name);
  if (functions.length > 0)
    losses.push({ k: 'functions_left', count: functions.length, names: functions });
  const refused = isXlsx(to) ? (file.names ?? []).map((n) => n.name).filter(excelRefuses) : [];
  if (refused.length > 0) losses.push({ k: 'names_left', count: refused.length, names: refused });
  if (names.length > 0) losses.push({ k: 'sheet_renamed', count: names.length, names });
  if (tally.uncalculated > 0)
    losses.push({
      k: 'formula_uncalculated',
      count: tally.uncalculated,
      functions: [...tally.functions].sort(),
    });
  if (tally.unwritten > 0) losses.push({ k: 'formula_unwritten', count: tally.unwritten });
  if (tally.texts > 0) losses.push({ k: 'text_cut', count: tally.texts });
  if (wide.length > 0) losses.push({ k: 'columns_cut', count: wide.length, sheets: wide });
  const differ = answersDiffering(file, meaning, to);
  if (differ.count > 0) losses.push({ k: 'answers_differ', ...differ });
  const simpler = simplifiedElsewhere(file.sheets.flatMap((s) => s.validations ?? []));
  if (simpler.count > 0) losses.push({ k: 'validation_simplified', ...simpler });
  const guarded = protectionsElsewhere(
    file.sheets.flatMap((s) => s.protections ?? []),
    keptStandardOf(to),
  );
  if (guarded.count > 0)
    losses.push({ k: 'protections_simplified', count: guarded.count, features: guarded.features });
  if (guarded.passwords > 0)
    losses.push({ k: 'protection_passwords_left', count: guarded.passwords });
  const pivots = pivotsElsewhere(file, isXlsx(to) ? 'xlsx' : 'odf');
  if (pivots.count > 0) losses.push({ k: 'pivots_simplified', ...pivots });
  const views = isXlsx(to) ? 0 : file.sheets.reduce((n, s) => n + (s.filterViews?.length ?? 0), 0);
  if (views > 0) losses.push({ k: 'filter_views_left', count: views });
  const slicers = slicersElsewhere(file, isXlsx(to));
  if (slicers > 0)
    losses.push({ k: isXlsx(to) ? 'slicers_unseen' : 'slicers_left', count: slicers });
  const kept =
    file.kept && file.kept.standard !== keptStandardOf(to) ? keptKinds(file.kept.items) : null;
  if (kept && kept.count > 0) losses.push({ k: 'kept', ...kept });
  return losses;
}

/** The slicers a format leaves out (ODF) or holds in LiveDoc's record alone (XLSX: not over a table exactly). */
function slicersElsewhere(file: WorkbookFile, xlsx: boolean): number {
  return file.sheets.reduce((n, sheet) => {
    const slicers = sheet.slicers ?? [];
    if (!xlsx) return n + slicers.length;
    const tables = xlsxTablesOf(sheet);
    return n + slicers.filter((s) => slicerTableAt(s, tables) < 0).length;
  }, 0);
}

/** The pivot tables a format's other apps hold more simply, counted, and every feature they lose, in order. */
function pivotsElsewhere(
  file: WorkbookFile,
  format: 'xlsx' | 'odf',
): { count: number; features: PivotSimplified[] } {
  const lost = file.sheets
    .flatMap((s) => s.pivots ?? [])
    .map((p) => pivotSimplified(p.fields, format));
  const found = new Set(lost.flat());
  const order = PIVOT_SIMPLIFIED.filter((f) => found.has(f));
  return { count: lost.filter((f) => f.length > 0).length, features: order };
}

/** What converting a workbook to `to` loses, its values worked out as a download's are, its kept content listed. */
export function workbookConversion(
  sheets: readonly Sheet[],
  record: WorkbookRecord,
  to: WorkbookFormat,
  kept?: KeptContent<StoredAt>,
): WorkbookConversion {
  const from = record.format;
  if (WorkbookRecord.sameStandard(from, to)) return { from, to, losses: [] };
  const file = workbookFileFor(sheets, record);
  // Only what is still anchored would be written, so only that is left behind.
  if (kept) file.kept = fileKept(kept, sheets).kept;
  return { from, to, losses: conversionLosses(file, from, to, record.meaning ?? 'google') };
}
