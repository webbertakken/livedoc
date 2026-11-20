// A category as the workbook every source answers (docs/specs/029-sheets/formulas.md "The oracle"): its fixture on
// `Data`, each case's id and formula on `Cases`, an array case written as an array formula over its block. And back:
// the answers a source's copy of that workbook holds, block by block.
import type { FileCell, FileValue, WorkbookFile } from '../files/workbook-file';
import { ERROR_CODES } from '../formula/values';
import {
  ORACLE_CASES_SHEET,
  ORACLE_DATA_COLS_MIN,
  ORACLE_DATA_ROWS_MIN,
  ORACLE_DATA_SHEET,
  OracleLayout,
  type OracleCategory,
  type OracleValue,
} from './corpus';

function fileValue(v: OracleValue): FileValue | undefined {
  if (v === null) return undefined;
  if (typeof v === 'number') return { k: 'n', v };
  if (typeof v === 'string') return { k: 's', v };
  if (typeof v === 'boolean') return { k: 'b', v };
  return { k: 's', v: v.e };
}

export function oracleFile(category: OracleCategory): WorkbookFile {
  const data: FileCell[] = [];
  category.data.forEach((row, r) =>
    row.forEach((v, c) => {
      const value = fileValue(v);
      if (value) data.push({ r, c, value });
    }),
  );
  const cases: FileCell[] = [];
  const blocks = OracleLayout.blocks(category);
  category.cases.forEach((x, i) => {
    const b = blocks[i]!;
    cases.push({ r: b.r, c: 0, value: { k: 's', v: x.id } });
    cases.push({
      r: b.r,
      c: b.c,
      formula: x.f,
      ...(b.rows * b.cols > 1 ? { spans: { rows: b.rows, cols: b.cols } } : {}),
    });
  });
  const size = OracleLayout.size(category);
  return {
    sheets: [
      {
        name: ORACLE_DATA_SHEET,
        rows: Math.max(ORACLE_DATA_ROWS_MIN, category.data.length),
        cols: Math.max(ORACLE_DATA_COLS_MIN, ...category.data.map((row) => row.length)),
        cells: data,
      },
      { name: ORACLE_CASES_SHEET, ...size, cells: cases },
    ],
  };
}

const ERROR_TEXT: readonly string[] = [...ERROR_CODES, '#NULL!'];
const LIBREOFFICE_ERROR = /^Err:\d{3}$/;

// A cell of a block, as a value. ODF has no error value: a formula's error, and an error inside its array, is cached
// as the text it shows (no case answers an error's text as text).
function oracleValue(cell: FileCell | undefined): OracleValue {
  const v = cell?.value;
  if (!v) return null;
  if (v.k === 'e') return { e: v.v };
  if (v.k === 's' && (ERROR_TEXT.includes(v.v) || LIBREOFFICE_ERROR.test(v.v))) return { e: v.v };
  return v.v;
}

export type FileAnswers = { answers: Record<string, OracleValue[][]>; problems: string[] };

/** The answers a source's copy of the category's workbook holds; a block whose result runs past it is a problem. */
export function answersOf(category: OracleCategory, file: WorkbookFile): FileAnswers {
  const sheet = file.sheets.find((s) => s.name === ORACLE_CASES_SHEET);
  if (!sheet) return { answers: {}, problems: [`no ${ORACLE_CASES_SHEET} sheet`] };
  const at = new Map<string, FileCell>();
  for (const cell of sheet.cells) at.set(`${cell.r},${cell.c}`, cell);
  const answers: Record<string, OracleValue[][]> = {};
  const problems: string[] = [];
  for (const b of OracleLayout.blocks(category)) {
    const id = at.get(`${b.r},0`)?.value;
    if (id?.k !== 's' || id.v !== b.id) {
      problems.push(`${b.id}: not found at row ${b.r + 1}`);
      continue;
    }
    // A spill past the block (into the blank row below or the column after it) means the case's size is wrong.
    const below = Array.from({ length: b.cols }, (_, j) => at.get(`${b.r + b.rows},${b.c + j}`));
    const right = Array.from({ length: b.rows }, (_, i) => at.get(`${b.r + i},${b.c + b.cols}`));
    if ([...below, ...right].some((cell) => oracleValue(cell) !== null))
      problems.push(`${b.id}: the answer runs past its ${b.rows} × ${b.cols} block`);
    answers[b.id] = Array.from({ length: b.rows }, (_, i) =>
      Array.from({ length: b.cols }, (_, j) => oracleValue(at.get(`${b.r + i},${b.c + j}`))),
    );
  }
  return { answers, problems };
}
