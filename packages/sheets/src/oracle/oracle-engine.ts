// The engine's own answers to a category (docs/specs/029-sheets/formulas.md "The oracle"): the same workbook every
// source answers, its formulas typed as a person types them, worked out once, block by block.
import { CellMap } from '../cells/cell-map';
import { Workbook } from '../engine/workbook';
import { dims, isError, type Scalar } from '../formula/values';
import { cellKey, type CellInput, type Sheet } from '../sheet';
import { SheetLimits } from '../sheet-limits';
import { readTypedInput } from '../typed-input';
import {
  ORACLE_CASES_SHEET,
  ORACLE_DATA_COLS_MIN,
  ORACLE_DATA_ROWS_MIN,
  ORACLE_DATA_SHEET,
  ORACLE_LOCALE,
  ORACLE_NOW,
  OracleLayout,
  type OracleCategory,
  type OracleValue,
} from './corpus';

/** The engine's answer to a case, or why it has none (`parse:<reason>`, `shape:<rows>x<cols>`). */
export type EngineAnswer = { ok: true; answer: OracleValue[][] } | { ok: false; why: string };

function sheetOf(id: string, title: string, rows: number, cols: number, order: number): Sheet {
  return {
    id,
    tabId: id,
    title,
    layout: {
      rows: Array.from({ length: rows }, (_, i) => `${id}r${i}`),
      cols: Array.from({ length: cols }, (_, i) => `${id}c${i}`),
    },
    cells: new CellMap(),
    rev: 0,
    createdAt: order,
    updatedAt: order,
    updatedBy: { id: '', name: '', color: '#000000' },
  };
}

function inputOf(v: OracleValue): CellInput | null {
  if (v === null) return null;
  if (typeof v === 'number') return { n: v };
  if (typeof v === 'string') return { s: v };
  if (typeof v === 'boolean') return { b: v };
  // An error in a fixture is typed as its formula, as a person writes one (`=NA()` is `#N/A`).
  return null;
}

export function oracleValueOf(v: Scalar): OracleValue {
  if (isError(v)) return { e: v.e };
  return v;
}

/** Every case of a category worked out by the engine, by id. */
export function engineAnswers(category: OracleCategory): Map<string, EngineAnswer> {
  const dataRows = Math.max(ORACLE_DATA_ROWS_MIN, category.data.length);
  const dataCols = Math.max(ORACLE_DATA_COLS_MIN, ...category.data.map((row) => row.length));
  const size = OracleLayout.size(category);
  const data = sheetOf('oracleData', ORACLE_DATA_SHEET, dataRows, dataCols, 0);
  const cases = sheetOf('oracleCases', ORACLE_CASES_SHEET, size.rows, size.cols, 1);
  category.data.forEach((row, r) =>
    row.forEach((v, c) => {
      const input = inputOf(v);
      if (input) data.cells.set(cellKey(data.layout.rows[r]!, data.layout.cols[c]!), { input });
    }),
  );
  if (category.data.some((row) => row.some((v) => typeof v === 'object' && v !== null)))
    throw new Error(`${category.category}: a fixture holds values, never errors`);
  // Formulas compile against both sheets, as a person types them on Cases.
  const typing = new Workbook({ sheets: [data, cases], locale: ORACLE_LOCALE });
  const ctx = typing.ctxFor(cases.id);
  const out = new Map<string, EngineAnswer>();
  const blocks = OracleLayout.blocks(category);
  category.cases.forEach((x, i) => {
    const b = blocks[i]!;
    cases.cells.set(cellKey(cases.layout.rows[b.r]!, cases.layout.cols[0]!), {
      input: { s: x.id },
    });
    const read = readTypedInput(x.f, ORACLE_LOCALE, ctx);
    if (read.kind !== 'value') {
      out.set(x.id, { ok: false, why: `parse:${read.kind === 'invalid' ? read.reason : 'empty'}` });
      return;
    }
    const key = cellKey(cases.layout.rows[b.r]!, cases.layout.cols[b.c]!);
    cases.cells.set(key, { input: read.input });
  });
  const engine = new Workbook({
    sheets: [data, cases],
    locale: ORACLE_LOCALE,
    now: () => ORACLE_NOW,
    rand: () => 0.5,
    limits: SheetLimits.spreadsheet,
  });
  for (const b of blocks) {
    if (out.has(b.id)) continue;
    const shape = dims(engine.formulaResult(cases.id, b.r, b.c));
    if (b.rows * b.cols > 1 || shape.rows * shape.cols > 1) {
      if (shape.rows !== b.rows || shape.cols !== b.cols) {
        out.set(b.id, { ok: false, why: `shape:${shape.rows}x${shape.cols}` });
        continue;
      }
    }
    const answer = Array.from({ length: b.rows }, (_, i) =>
      Array.from({ length: b.cols }, (_, j) => {
        const v = engine.value(cases.id, b.r + i, b.c + j);
        return oracleValueOf(v as Scalar);
      }),
    );
    out.set(b.id, { ok: true, answer });
  }
  return out;
}
