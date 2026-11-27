// How a layout change shrinks the spreadsheet's named functions (docs/specs/029-sheets/formulas.md "Named functions",
// D301): rows or columns deleted inside a range a definition reads shrink it, as other sheets' formulas' ranges
// shrink. The sheet store saves the shrink with the deletion and puts it back with its undo.
import {
  shrinkNamedFunctionsBy,
  shrunkFunctions,
  type NamedFunction,
  type SheetLayout,
  type SheetWrite,
  type ShrunkFunction,
} from '@livedoc/sheets';

// A change to the named functions, worked out against the list as it is then; null leaves it.
export type FunctionsChange = (now: readonly NamedFunction[]) => NamedFunction[] | null;

export type FunctionsShrink = { apply: FunctionsChange; shrunk: ShrunkFunction[] };

/**
 * The shrink `edits` make (worked out against any list) and the functions it shrinks in `now`; null when it shrinks
 * none. `layoutOf` gives each sheet's layout before the edits.
 */
export function functionsShrinkOf(
  now: readonly NamedFunction[],
  edits: readonly { sheetId: string; write: SheetWrite }[],
  layoutOf: (sheetId: string) => SheetLayout | undefined,
): FunctionsShrink | null {
  if (now.length === 0) return null;
  const steps = edits.flatMap(({ sheetId, write }) => {
    const before = layoutOf(sheetId);
    return write.kind === 'layout' && before ? [{ sheetId, before, changes: write.changes }] : [];
  });
  const apply = (list: readonly NamedFunction[]) => shrinkNamedFunctionsBy(steps, list);
  const after = apply(now);
  return after ? { apply, shrunk: shrunkFunctions(now, after) } : null;
}
