// GETPIVOTDATA (docs/specs/029-sheets/formulas.md "Lookup", pivot-tables.md "Making one", D603): a value of the pivot
// table a cell is in, by the value's name and the items of its groups, as Google Sheets reads them
// (corpus/google/getpivotdata-answers.json). Google's words for each way it finds nothing.
import type { EvalValue, Frame } from '../../engine/frame';
import { err, isError, type Scalar, type SheetError } from '../values';
import { MANY, fn, refArg, scalarArg, type FnDef } from '../fn';

const WORDS = {
  pairs: 'Field key and values should come in pairs of key and value for function GETPIVOTDATA',
  target: 'Target range is not in a pivot table for function GETPIVOTDATA, parameter 2.',
  data: 'Data field not found in pivot table for function GETPIVOTDATA, parameter 1.',
  combination: 'Field combination not found in pivot table for function GETPIVOTDATA',
  key: (key: string) => `Field key [${key}] not found in pivot table for function GETPIVOTDATA`,
} as const;

// An argument as the text it is matched by.
const textOf = (v: Exclude<Scalar, SheetError>) => (v === null ? '' : String(v));

function getPivotData(args: EvalValue[], f: Frame): EvalValue {
  const name = scalarArg(args[0]!, f);
  if (isError(name)) return name;
  if ((args.length - 2) % 2 !== 0) return err('#REF!', WORDS.pairs);
  const at = refArg(args[1]);
  const pivot = at && f.pivotAt(at.sheetId, at.r1, at.c1);
  if (!pivot) return err('#REF!', WORDS.target);
  const { index } = pivot.out;
  const pairs: [string, string][] = [];
  for (let i = 2; i < args.length; i += 2) {
    const key = scalarArg(args[i]!, f);
    const item = scalarArg(args[i + 1]!, f);
    if (isError(key)) return key;
    if (isError(item)) return item;
    // A field is named as its header shows it, case and all; an item case aside.
    if (!index.keys.includes(textOf(key))) return err('#REF!', WORDS.key(textOf(key)));
    pairs.push([textOf(key), textOf(item).toLowerCase()]);
  }
  // One value is read whatever it is called; of several, the one named so, or summarising the column named so.
  const wanted = textOf(name).toLowerCase();
  const v =
    index.values.length === 1
      ? 0
      : index.values.findIndex(
          (x) => x.name.toLowerCase() === wanted || x.col?.toLowerCase() === wanted,
        );
  if (v < 0) return err('#REF!', WORDS.data);
  const cell = index.cells.find(
    (x) =>
      x.v === v &&
      x.pairs.length === pairs.length &&
      x.pairs.every(([key, item]) => pairs.some(([k, i]) => k === key && i === item.toLowerCase())),
  );
  if (!cell) return err('#REF!', WORDS.combination);
  return pivot.out.rows[cell.r]![cell.c]!;
}

export const PIVOT_FUNCTIONS: Record<string, FnDef> = {
  GETPIVOTDATA: fn(2, MANY, getPivotData),
};
