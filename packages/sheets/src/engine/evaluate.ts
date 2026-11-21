// The evaluator: a stored formula's tree to a value,
// with operators broadcasting over arrays as Sheets does. References resolve through the frame's layouts at
// evaluation time, so a formula always reads the cells its ids name.
import type { StoredRef } from '../sheet';
import type { Node } from '../formula/ast';
import { deref, lift, tooBig } from '../formula/fn';
import { FUNCTIONS } from '../formula/registry';
import { resolveRef } from '../formula/stored';
import { arrayFrame, implicit, posToRange, rectangleOf } from './refs';
import { err, isArray, isError, type Value } from '../formula/values';
import { binaryOperation, unaryOperation, type UnaryOperator } from '../formula/operators';
import { isAreas, isRef, type EvalValue, type Frame, type RangeRef } from './frame';

function unary(kind: UnaryOperator, v: Value): Value {
  return lift([v], ([x]) => unaryOperation(kind, x!));
}

// An operator's operand: a range intersected where one value goes, then read as a value.
function operand(node: Node, refs: readonly StoredRef[], f: Frame): Value {
  return deref(implicit(evaluate(node, refs, f), f), f);
}

// `:` between two references: the rectangle spanning both, on one sheet.
function spanOf(a: RangeRef, b: RangeRef): EvalValue {
  if (a.sheetId !== b.sheetId) return err('#VALUE!', 'A range joins two cells of one sheet');
  return {
    ref: {
      sheetId: a.sheetId,
      r1: Math.min(a.r1, b.r1),
      c1: Math.min(a.c1, b.c1),
      r2: Math.max(a.r2, b.r2),
      c2: Math.max(a.c2, b.c2),
    },
  };
}

// A space between two references: the cells they share, or #NULL!.
function intersectionOf(a: RangeRef, b: RangeRef): EvalValue {
  const r1 = Math.max(a.r1, b.r1);
  const c1 = Math.max(a.c1, b.c1);
  const r2 = Math.min(a.r2, b.r2);
  const c2 = Math.min(a.c2, b.c2);
  if (a.sheetId !== b.sheetId || r1 > r2 || c1 > c2) return err('#NULL!');
  return { ref: { sheetId: a.sheetId, r1, c1, r2, c2 } };
}

const RAGGED_LITERAL =
  'In ARRAY_LITERAL, an Array Literal was missing values for one or more rows.';

// An array literal (formulas.md "Operators"): each slot worked out whole, the slots of a row joined side by side
// and the rows stacked; parts that do not line up are #VALUE!.
function joinLiteral(rows: Node[][], refs: readonly StoredRef[], f: Frame): Value {
  const out: Value[][] = [];
  let width = -1;
  for (const row of rows) {
    const parts = row.map((x) => deref(evaluate(x, refs, f), f));
    const failed = parts.find((p) => isError(p));
    if (failed !== undefined) return failed;
    const blocks = parts.map((p) => (isArray(p) ? p.rows : [[p]]));
    const height = blocks[0]!.length;
    if (blocks.some((b) => b.length !== height)) return err('#VALUE!', RAGGED_LITERAL);
    for (let i = 0; i < height; i++) {
      const line = blocks.flatMap((b) => b[i]!);
      if (width >= 0 && line.length !== width) return err('#VALUE!', RAGGED_LITERAL);
      width = line.length;
      out.push(line);
    }
  }
  if (tooBig(out.length, Math.max(0, width))) return err('#NUM!', 'The result is too large');
  return { rows: out };
}

export function evaluate(node: Node, refs: readonly StoredRef[], f: Frame): EvalValue {
  switch (node.k) {
    case 'num':
      return node.v;
    case 'str':
      return node.v;
    case 'bool':
      return node.v;
    case 'err':
      return err(node.v);
    // A named range reads as its cells (formulas.md "Named ranges").
    case 'name': {
      const pos = f.ctx.name?.(node.v);
      const range = pos ? posToRange(pos, f) : null;
      return range ? { ref: range } : err('#NAME?', `Unknown name ${node.v}`);
    }
    case 'stored': {
      const ref = refs[node.i];
      const pos = ref ? resolveRef(ref, f.ctx) : null;
      const range = pos ? posToRange(pos, f) : null;
      return range ? { ref: range } : err('#REF!');
    }
    // A typed A1 reference never reaches evaluation: stored templates hold `@n` (INDIRECT reads A1 itself).
    case 'ref':
      return err('#REF!');
    case 'neg':
    case 'pos':
    case 'pct':
      return unary(node.k, operand(node.a, refs, f));
    case 'bin': {
      const a = operand(node.a, refs, f);
      const b = operand(node.b, refs, f);
      return lift([a, b], ([x, y]) => binaryOperation(node.op, x!, y!));
    }
    case 'arr':
      return joinLiteral(node.rows, refs, arrayFrame(f));
    case 'range':
    case 'isect': {
      const a = rectangleOf(evaluate(node.a, refs, f));
      if (isError(a)) return a;
      const b = rectangleOf(evaluate(node.b, refs, f));
      if (isError(b)) return b;
      return node.k === 'range' ? spanOf(a, b) : intersectionOf(a, b);
    }
    case 'union': {
      const areas: RangeRef[] = [];
      for (const item of node.items) {
        const v = evaluate(item, refs, f);
        if (isRef(v)) areas.push(v.ref);
        else if (isAreas(v)) areas.push(...v.areas);
        else return isError(v) ? v : err('#VALUE!', 'A reference was expected here');
      }
      return { areas };
    }
    case 'call': {
      const def = FUNCTIONS[node.name];
      if (!def || !Object.prototype.hasOwnProperty.call(FUNCTIONS, node.name))
        return err('#NAME?', `Unknown function ${node.name}`);
      const n = node.args.length;
      if (n < def.min || n > def.max) {
        const expected =
          def.min === def.max
            ? `exactly ${def.min}`
            : n < def.min
              ? `at least ${def.min}`
              : `at most ${def.max}`;
        return err('#N/A', `Wrong number of arguments to ${node.name}. Expected ${expected}`);
      }
      if (def.volatile) f.volatile(node.name);
      const argFrame = def.arrays ? arrayFrame(f) : f;
      const evalArg = (a: Node | null): EvalValue => (a ? evaluate(a, refs, argFrame) : null);
      if (def.lazy)
        return def.impl(
          node.args.map((a) => () => evalArg(a)),
          argFrame,
        );
      return def.impl(node.args.map(evalArg), argFrame);
    }
  }
}
