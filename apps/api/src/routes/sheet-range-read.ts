// A range of this spreadsheet read for another's IMPORTRANGE (docs/specs/029-sheets/formulas.md "Other workbooks",
// "Who reads what", "Fresh values"), inside this document's room, with the reader's own access. The room's live
// sheets are worked out by the engine, the range string compiled on the first sheet, and the cells it names read;
// an IMPORTRANGE of this spreadsheet's own is answered in turn (`nested`) until the chain is RANGE_DEPTH_MAX deep.
// A source that is not there and one the reader may not open answer alike, so an address never tells (D76).
import {
  compileFormula,
  importKey,
  IMPORT_VALUES_MAX,
  isError,
  RANGE_WORDS,
  SheetLimits,
  Workbook,
  type ImportAnswer,
  type ImportAsk,
  type ImportedCell,
  type ImportRequest,
  type Value,
} from '@livedoc/sheets';
import { readWorkbook } from '../db/workbook';
import type { DocumentRouteContext } from './context';
import { sheetCaller } from './sheet-route-kit';
import { loadSpreadsheetSheets, workbookCellCount, workbookVersion } from './workbook-sheets-load';

/** The spreadsheets a chain of IMPORTRANGEs reads at most, the asker first (D77). Safe range 2 to 8. */
export const RANGE_DEPTH_MAX = 4;
/** Rounds of answering a source's own IMPORTRANGEs, for ones whose arguments read others. Safe range 1 to 8. */
export const RANGE_ROUNDS_MAX = 4;
/** The cells a source holds at most to be worked out here: a fraction of the 20 million a workbook may hold, so a read
 * fits the room's memory and time. Safe range 100,000 to 2,000,000. */
export const RANGE_SOURCE_CELLS_MAX = 500_000;

/** Answers kept while their source has not changed, the oldest let go first. Safe range 16 to 1,000. */
export const RANGE_MEMO_MAX = 64;

// The room's last answers, by range and the source's version (workbookVersion and its settings): a page asking every
// minute costs one cheap read while nothing changed. Only answers read without a chain are kept, since another
// source's change would not show in this one's version.
const memo = new Map<string, ImportAnswer>();

function remember(key: string, answer: ImportAnswer): void {
  memo.delete(key);
  memo.set(key, answer);
  if (memo.size > RANGE_MEMO_MAX) memo.delete(memo.keys().next().value!);
}

/** What another spreadsheet asks of this one: the range string, and the spreadsheets already on the chain. */
export type RangeReadQuery = { range: string; path: readonly string[] };

/** How this room asks a further source for one of its own IMPORTRANGEs (the room client; a test's stand-in). */
export type NestedRead = (source: string, query: RangeReadQuery) => Promise<ImportAnswer>;

type RangeImportRequest = Extract<ImportRequest, { kind: 'range' }>;

const words = (error: '#REF!' | '#ERROR!', why: string): ImportAnswer => ({ error, why });
export const PERMISSION = words('#REF!', RANGE_WORDS.permission);
export const NOT_FOUND = words('#REF!', RANGE_WORDS.notFound);
export const CIRCULAR = words('#REF!', RANGE_WORDS.circular);
const TOO_LARGE = words('#ERROR!', RANGE_WORDS.tooLarge);
const CONNECT: ImportAnswer = { error: '#REF!', why: RANGE_WORDS.connect, connect: true };

/** One cell's value as it crosses: an error by its code alone; Loading… (a chain still answering) as `#N/A`. */
function crossing(value: Value): ImportedCell {
  if (isError(value)) return { e: value.e };
  // A cell's value is never an array: a spill is read cell by cell.
  return value as ImportedCell;
}

export async function answerRangeRead(
  ctx: DocumentRouteContext,
  documentId: string,
  query: RangeReadQuery,
  nested: NestedRead,
): Promise<ImportAnswer> {
  const started = Date.now();
  const log = (reason: string) =>
    console.info(
      `[imports] range ${reason} document=${documentId} asker=${query.path[0] ?? ''} ms=${Date.now() - started}`,
    );
  const caller = await sheetCaller(ctx, documentId, 'read');
  if (caller instanceof Response || caller.scopeTab) {
    log('refused reason=permission');
    return PERMISSION;
  }
  const record = await readWorkbook(ctx.env, documentId);
  if (!record) {
    log('refused reason=not_a_spreadsheet');
    return NOT_FOUND;
  }
  const key = JSON.stringify([
    documentId,
    query.range,
    record.settings,
    await workbookVersion(ctx.env, documentId),
  ]);
  const kept = memo.get(key);
  if (kept) {
    log('kept');
    return kept;
  }
  if ((await workbookCellCount(ctx.env, documentId)) > RANGE_SOURCE_CELLS_MAX) {
    log('refused reason=too_large');
    return TOO_LARGE;
  }
  const sheets = await loadSpreadsheetSheets(ctx.env, documentId);
  const first = sheets[0];
  if (!first) {
    log('refused reason=no_sheets');
    return NOT_FOUND;
  }
  const wb = new Workbook({
    sheets,
    locale: record.settings.locale,
    limits: SheetLimits.of(true),
    iteration: record.settings.iterate,
    imports: { access: 'allowed', web: false },
  });
  const compiled = compileFormula(`=${query.range}`, wb.ctxFor(first.id));
  const range = compiled.ok ? wb.rangeOf(first.id, compiled.formula) : null;
  if (!range) {
    log('refused reason=not_found');
    return NOT_FOUND;
  }
  const rows = range.r2 - range.r1 + 1;
  const cols = range.c2 - range.c1 + 1;
  if (rows * cols > IMPORT_VALUES_MAX) {
    log('refused reason=too_large');
    return TOO_LARGE;
  }
  const read = (): ImportedCell[][] =>
    Array.from({ length: rows }, (_, i) =>
      Array.from({ length: cols }, (_, j) =>
        crossing(wb.value(range.sheetId, range.r1 + i, range.c1 + j)),
      ),
    );
  let values = read();
  const path = [...query.path, documentId];
  let chained = false;
  for (let round = 0; round < RANGE_ROUNDS_MAX; round++) {
    const asks = wb.takeImportAsks();
    if (asks.length === 0) break;
    chained = true;
    const answers = await Promise.all(
      asks.map((ask) => answerNested(ask, path, record.rangeSources ?? [], nested)),
    );
    asks.forEach((ask, i) => wb.landImport(importKey(ask.request), answers[i]!));
    values = read();
  }
  log(`read cells=${rows * cols} chained=${chained}`);
  const answer: ImportAnswer = { values };
  if (!chained) remember(key, answer);
  return answer;
}

// One of this source's own IMPORTRANGEs: refused around a loop or past the depth, refused unless this source is
// connected to it (as the asker's had to be), else read from that source with the same reader.
function answerNested(
  ask: ImportAsk,
  path: readonly string[],
  connected: readonly string[],
  nested: NestedRead,
): Promise<ImportAnswer> {
  // Only a range import is asked where nothing fetches the web (`web: false`).
  const request = ask.request as RangeImportRequest;
  if (path.includes(request.source) || path.length >= RANGE_DEPTH_MAX)
    return Promise.resolve(CIRCULAR);
  if (!connected.includes(request.source)) return Promise.resolve(CONNECT);
  return nested(request.source, { range: request.range, path });
}
