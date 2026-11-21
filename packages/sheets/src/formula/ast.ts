// The formula syntax tree. A typed formula's references are positional
// (`ref`); a stored template's are indexes into its StoredRef list (`stored`).
import type { ErrorCode } from './values';

// A reference as typed: zero-based positions; absent rows mean whole columns, absent columns whole rows.
export type A1Ref = {
  sheet?: string;
  r1?: number;
  c1?: number;
  r2?: number;
  c2?: number;
  // Absolute bits as StoredRef.a: 1 r1, 2 c1, 4 r2, 8 c2.
  a: number;
  open?: 'r' | 'c';
  spill?: true;
  // Where the reference (with its sheet prefix and spill suffix) was in the source.
  start: number;
  end: number;
};

export type BinaryOp = '+' | '-' | '*' | '/' | '^' | '&' | '=' | '<>' | '<' | '>' | '<=' | '>=';

export type Node =
  | { k: 'num'; v: number }
  | { k: 'str'; v: string }
  | { k: 'bool'; v: boolean }
  | { k: 'err'; v: ErrorCode }
  | { k: 'ref'; ref: A1Ref }
  | { k: 'stored'; i: number }
  | { k: 'name'; v: string }
  | { k: 'neg'; a: Node }
  | { k: 'pos'; a: Node }
  | { k: 'pct'; a: Node }
  | { k: 'bin'; op: BinaryOp; a: Node; b: Node }
  | { k: 'call'; name: string; args: (Node | null)[]; start: number; end: number }
  // A function value called with values: `LAMBDA(x, x*2)(5)` (formulas.md "LAMBDA and LET").
  | { k: 'apply'; fn: Node; args: (Node | null)[] }
  | { k: 'arr'; rows: Node[][] }
  // The reference operators (formulas.md "Reference operators"): `:` between expressions, a space (intersection),
  // and commas in brackets (union).
  | { k: 'range'; a: Node; b: Node }
  | { k: 'isect'; a: Node; b: Node }
  | { k: 'union'; items: Node[] };

/** A node's operands, arguments or slots, in source order. */
export function childrenOf(node: Node): Node[] {
  switch (node.k) {
    case 'neg':
    case 'pos':
    case 'pct':
      return [node.a];
    case 'bin':
    case 'range':
    case 'isect':
      return [node.a, node.b];
    case 'call':
      return node.args.filter((a): a is Node => a !== null);
    case 'apply':
      return [node.fn, ...node.args.filter((a): a is Node => a !== null)];
    case 'arr':
      return node.rows.flat();
    case 'union':
      return node.items;
    default:
      return [];
  }
}

// Every reference in a tree, in source order.
export function refsOf(node: Node): A1Ref[] {
  return collectRefs(node, []).sort((x, y) => x.start - y.start);
}

function collectRefs(node: Node, out: A1Ref[]): A1Ref[] {
  if (node.k === 'ref') out.push(node.ref);
  for (const child of childrenOf(node)) collectRefs(child, out);
  return out;
}

// Every function name called in a tree (upper case), for telemetry and card-function detection.
export function callsOf(node: Node, out: Set<string> = new Set()): Set<string> {
  if (node.k === 'call') out.add(node.name);
  for (const child of childrenOf(node)) callsOf(child, out);
  return out;
}
