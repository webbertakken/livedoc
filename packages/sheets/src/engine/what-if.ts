// Working a formula out afresh with some cells read as other values (docs/specs/029-sheets/formulas.md "Functions":
// Lookup, MULTIPLE.OPERATIONS): the target's formula, and every formula between it and the swapped cells, is worked
// out again in a frame that reads each swapped cell as its stand-in; every other cell is read as the workbook has it.
// The workbook's own values are never touched. Each read is noted against the formula asking (`reader`), so it
// hears when any cell the answer rests on changes.
import { deref } from '../formula/fn';
import { storedAst } from '../formula/stored';
import { err, scalarOf, type Value } from '../formula/values';
import type { StoredFormula } from '../sheet';
import type { CellNo } from './cell-numbers';
import { cellFrame, type FrameSource } from './cell-frame';
import { evaluate } from './evaluate';
import type { CellAt, Frame, Swap } from './frame';

// How many formulas deep a chain is worked out afresh: past it the answer is an error rather than a stack overflow.
export const WHAT_IF_DEPTH_MAX = 250;

const keyOf = (at: CellAt) => `${at.sheetId}|${at.r}|${at.c}`;

// The cells reading the swapped ones, however indirectly: only these can answer otherwise (LibreOffice's table
// operations reach the same cells, by the same dependencies).
function dependentsOf(src: FrameSource, swaps: readonly Swap[]): Set<string> {
  const seen = new Set<string>();
  const queue: CellAt[] = swaps.map((s) => s.cell);
  while (queue.length > 0) {
    for (const reader of src.readersOf(queue.pop()!)) {
      const key = keyOf(reader);
      if (seen.has(key)) continue;
      seen.add(key);
      queue.push(reader);
    }
  }
  return seen;
}

/** The value of `target` with each swapped cell read as its stand-in (the first swap of a cell wins). */
export function workOutWith(
  src: FrameSource,
  reader: CellNo,
  target: CellAt,
  swaps: readonly Swap[],
): Value {
  // The target worked out as it stands first: its chain is then in the dependency graph, and the reader hears it.
  const plain = src.cell(target.sheetId, target.r, target.c, reader);
  const affected = dependentsOf(src, swaps);
  const memo = new Map<string, Value>();
  const working = new Set<string>();
  const formulaAt = (at: CellAt): StoredFormula | null => {
    const input = src.input(at.sheetId, at.r, at.c);
    return input && 'f' in input ? input.f : null;
  };

  const read = (at: CellAt, inRange: boolean): Value => {
    const key = keyOf(at);
    const swap = swaps.find((s) => keyOf(s.cell) === key);
    if (swap) return swap.value;
    const value = src.cell(at.sheetId, at.r, at.c, inRange ? null : reader);
    const formula = affected.has(key) ? formulaAt(at) : null;
    return formula ? afresh(at, key, formula) : value;
  };

  const afresh = (at: CellAt, key: string, formula: StoredFormula): Value => {
    const known = memo.get(key);
    if (known !== undefined) return known;
    if (working.has(key)) return err('#REF!', 'A formula worked out afresh reads itself');
    if (working.size >= WHAT_IF_DEPTH_MAX)
      return err('#NUM!', `Formulas worked out afresh run deeper than ${WHAT_IF_DEPTH_MAX}`);
    // A formula that does not parse reads no cell, so it is never among the affected.
    const ast = storedAst(formula)!;
    working.add(key);
    let value: Value;
    try {
      const frame = swappedFrame(at);
      value = deref(evaluate(ast, formula.r, frame), frame);
    } finally {
      working.delete(key);
    }
    // A spilling formula's own cell is its array's first value.
    const own = scalarOf(value);
    memo.set(key, own);
    return own;
  };

  const swappedFrame = (at: CellAt): Frame => ({
    ...cellFrame(src, reader, at.sheetId, at.r, at.c),
    cell: (s, r, c, inRange) => read({ sheetId: s, r, c }, !!inRange),
    // A swap made inside the chain comes before those already made (OpenFormula's queued order).
    workOut: (t, more) => workOutWith(src, reader, t, [...more, ...swaps]),
  });

  const key = keyOf(target);
  const formula = affected.has(key) ? formulaAt(target) : null;
  return formula ? afresh(target, key, formula) : plain;
}
