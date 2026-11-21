// MULTIPLE.OPERATIONS (docs/specs/029-sheets/formulas.md "Functions": Lookup): OpenFormula's what-if table. A formula
// cell is worked out afresh with one cell, or two, read as other cells' values, and every formula between them with
// it (engine/what-if.ts), so a grid of them tabulates a model over its inputs.
import type { CellAt, Swap } from '../../engine/frame';
import { fn, refArg, type FnDef } from '../fn';
import { err, isError, type SheetError } from '../values';
import type { EvalValue, Frame } from '../../engine/frame';

// Each argument is a reference to one cell.
function cellOf(v: EvalValue): CellAt | SheetError {
  const r = refArg(v);
  if (!r || r.r1 !== r.r2 || r.c1 !== r.c2)
    return err('#VALUE!', 'MULTIPLE.OPERATIONS takes references to single cells');
  return { sheetId: r.sheetId, r: r.r1, c: r.c1 };
}

function swapOf(from: EvalValue, to: EvalValue, f: Frame): Swap | SheetError {
  const cell = cellOf(from);
  if (isError(cell)) return cell;
  const stand = cellOf(to);
  if (isError(stand)) return stand;
  return { cell, value: f.cell(stand.sheetId, stand.r, stand.c) };
}

export const MULTIPLE_OPERATIONS_FUNCTIONS: Record<string, FnDef> = {
  'MULTIPLE.OPERATIONS': fn(3, 5, (args, f) => {
    if (args.length === 4)
      return err('#N/A', 'MULTIPLE.OPERATIONS takes a column cell and its replacement together');
    const target = cellOf(args[0]!);
    if (isError(target)) return target;
    const swaps: Swap[] = [];
    for (let i = 1; i < args.length; i += 2) {
      const swap = swapOf(args[i]!, args[i + 1]!, f);
      if (isError(swap)) return swap;
      swaps.push(swap);
    }
    return f.workOut(target, swaps);
  }),
};
