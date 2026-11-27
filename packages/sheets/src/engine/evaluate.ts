// The evaluator: a stored formula's tree to a value,
// with operators broadcasting over arrays as Sheets does. References resolve through the frame's layouts at
// evaluation time, so a formula always reads the cells its ids name.
import type { StoredRef } from '../sheet';
import type { Node } from '../formula/ast';
import { deref, lift, tooBig, UNCALLED_LAMBDA, type Thunk } from '../formula/fn';
import { budgetCalls, callLambda, plural } from '../formula/lambda';
import { NAMED_FUNCTION_DEPTH_MAX, type NamedFunctionDef } from '../named-functions';
import { liftedCall } from '../formula/lifted-parameters';
import { FUNCTIONS } from '../formula/registry';
import { encodeTableSpec, resolveRef, tableRefError } from '../formula/stored';
import { TableArea } from '../tables/table-ref';
import { arrayFrame, implicit, posToRange, rectangleOf } from './refs';
import { err, isArray, isError, type Value } from '../formula/values';
import { binaryOperation, unaryOperation, type UnaryOperator } from '../formula/operators';
import {
  isAreas,
  isLambda,
  isRef,
  type EvalValue,
  type Frame,
  type RangeRef,
  type Scope,
} from './frame';

function unary(kind: UnaryOperator, v: Value, locale: string): Value {
  return lift([v], ([x]) => unaryOperation(kind, x!, locale));
}

// An operator's operand: a range intersected where one value goes, then read as a value.
function operand(node: Node, refs: readonly StoredRef[], f: Frame): Value {
  return deref(implicit(evaluate(node, refs, f), f), f);
}

// A chain of powers written without brackets, grouped from the right as Google groups it: 2^3^2 is 2^(3^2), 512
// (formulas.md, the file's meaning; the standards' meanings group from the left, as parsed).
function powerFromTheRight(node: PowerNode, refs: readonly StoredRef[], f: Frame): Value {
  const operands: Node[] = [];
  let link = node;
  // A chained power's left operand is a power (the parser marks no other).
  while (link.chained) {
    operands.push(link.b);
    link = link.a as PowerNode;
  }
  operands.push(link.b, link.a);
  let power = operand(operands[0]!, refs, f);
  for (const next of operands.slice(1))
    power = lift([operand(next, refs, f), power], ([x, y]) =>
      binaryOperation('^', x!, y!, f.locale),
    );
  return power;
}

type PowerNode = Extract<Node, { k: 'bin' }>;

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

// A lazy argument: worked out when called, or within more names (LET, LAMBDA), over the names around it.
function thunk(node: Node | null, refs: readonly StoredRef[], f: Frame): Thunk {
  const run = () => (node ? evaluate(node, refs, f) : null);
  return Object.assign(run, {
    within: (names: Scope) =>
      node ? evaluate(node, refs, { ...f, scope: new Map([...(f.scope ?? []), ...names]) }) : null,
    identifier: node?.k === 'name' ? node.v : null,
  });
}

export const NAMED_FUNCTION_TOO_DEEP = 'This named function calls itself too deeply';

// A named function called by its name: its count of values checked, one call spent from the budget, as a LAMBDA's.
function callNamed(def: NamedFunctionDef, values: readonly EvalValue[], f: Frame): EvalValue {
  if (values.length !== def.params.length)
    return err(
      '#N/A',
      `Wrong number of arguments to ${def.name}. Expected exactly ${plural(def.params.length)}, but got ${plural(values.length)}.`,
    );
  return budgetCalls(f, 1) ?? applyNamed(def, values, f);
}

// A named function's definition worked out with its placeholders as the values given (formulas.md "Named functions"):
// the caller's LET and LAMBDA names unseen, nested at most NAMED_FUNCTION_DEPTH_MAX.
function applyNamed(def: NamedFunctionDef, values: readonly EvalValue[], f: Frame): EvalValue {
  const depth = f.fnDepth ?? 0;
  if (depth >= NAMED_FUNCTION_DEPTH_MAX) return err('#NUM!', NAMED_FUNCTION_TOO_DEEP);
  const scope = new Map(def.params.map((p, i) => [p, values[i]!]));
  return evaluate(def.ast, def.refs, { ...f, scope, fnDepth: depth + 1 });
}

// A named function named without brackets, handed to a helper: a LAMBDA of its placeholders, whose callers count it.
function namedLambda(def: NamedFunctionDef, f: Frame): EvalValue {
  return { lambda: { params: def.params, apply: (values) => applyNamed(def, values, f) } };
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
      const bound = f.scope?.get(node.v);
      if (bound !== undefined) return bound;
      const pos = f.ctx.name?.(node.v);
      const range = pos ? posToRange(pos, f) : null;
      if (range) return { ref: range };
      // A table's name alone, typed before the table was made: its data rows.
      const table = encodeTableSpec({ table: node.v, cols: null, area: TableArea.data }, f.ctx);
      const rows = table && resolveRef(table, f.ctx);
      const read = rows ? posToRange(rows, f) : null;
      if (read) return { ref: read };
      const named = f.ctx.fn?.(node.v);
      return named ? namedLambda(named, f) : err('#NAME?', `Unknown name ${node.v}`);
    }
    case 'stored': {
      const ref = refs[node.i];
      const pos = ref ? resolveRef(ref, f.ctx, f.row) : null;
      const range = pos ? posToRange(pos, f) : null;
      if (range) return { ref: range };
      if (ref?.t !== undefined) return err(tableRefError(ref, f.ctx));
      // A sheet named by a title no sheet has: Google's words (formulas.md "Other sheets").
      return pos?.sheet && 'title' in pos.sheet
        ? err('#REF!', `Unresolved sheet name '${pos.sheet.title}'.`)
        : err('#REF!');
    }
    // A table reference kept as typed, its table read by name now (formulas.md "Table references").
    case 'table': {
      const ref = encodeTableSpec(node.spec, f.ctx, { r: f.row, c: f.col });
      if (!ref) return err('#REF!', `Unknown table ${node.spec.table ?? ''}`.trimEnd());
      const pos = resolveRef(ref, f.ctx, f.row);
      const range = pos ? posToRange(pos, f) : null;
      return range ? { ref: range } : err(tableRefError(ref, f.ctx));
    }
    // A typed A1 reference never reaches evaluation: stored templates hold `@n` (INDIRECT reads A1 itself).
    case 'ref':
      return err('#REF!');
    case 'neg':
    case 'pos':
    case 'pct':
      return unary(node.k, operand(node.a, refs, f), f.locale);
    case 'bin': {
      if (node.chained && f.meaning === 'google') return powerFromTheRight(node, refs, f);
      const a = operand(node.a, refs, f);
      const b = operand(node.b, refs, f);
      return lift([a, b], ([x, y]) => binaryOperation(node.op, x!, y!, f.locale));
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
    case 'apply': {
      const fn = evaluate(node.fn, refs, f);
      if (!isLambda(fn))
        return isError(fn) ? fn : err('#VALUE!', 'Only a LAMBDA can be called with values');
      return callLambda(
        fn.lambda,
        node.args.map((a) => (a ? evaluate(a, refs, f) : null)),
        f,
      );
    }
    case 'call': {
      // A LET or LAMBDA name holding a LAMBDA is called as one (`double(5)`).
      const bound = f.scope?.get(node.name);
      if (bound !== undefined && isLambda(bound))
        return callLambda(
          bound.lambda,
          node.args.map((a) => (a ? evaluate(a, refs, f) : null)),
          f,
        );
      const def = FUNCTIONS[node.name];
      if (!def || !Object.prototype.hasOwnProperty.call(FUNCTIONS, node.name)) {
        const named = f.ctx.fn?.(node.name);
        if (!named) return err('#NAME?', `Unknown function ${node.name}`);
        return callNamed(
          named,
          node.args.map((a) => (a ? evaluate(a, refs, f) : null)),
          f,
        );
      }
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
          node.args.map((a) => thunk(a, refs, argFrame)),
          argFrame,
        );
      const args = node.args.map(evalArg);
      if (!def.lambdas && args.some((a) => isLambda(a))) return err('#VALUE!', UNCALLED_LAMBDA);
      return (
        liftedCall(node.name, args, argFrame, (each) => def.impl(each, argFrame)) ??
        def.impl(args, argFrame)
      );
    }
  }
}
