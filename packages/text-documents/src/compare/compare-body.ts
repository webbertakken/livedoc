// Two containers' blocks compared (review.md "Compare documents", "What is compared"): first the blocks that read the
// same are kept, then in each stretch between them the paragraphs alike in their words and the tables with as many
// columns are paired and compared word by word or row by row, and what is left of the stretch is compared as one
// reading, so a paragraph split or joined reads as a break or a join. The first paragraphs of both always pair.
import type { Block } from '../model/blocks';
import type { Table, TableCell, TableRow } from '../model/tables';
import { buildBlocks, type CompareContext, type TokenOp } from './compare-build';
import { diffSequences, editsWithin, type DiffOp } from './compare-diff';
import {
  COMPARE_SIMILAR_PARAGRAPHS,
  likeness,
  readingKey,
  sameToken,
  stableKey,
  tokensOf,
  wordsOf,
  type CompareToken,
} from './compare-tokens';

/** Appends a long list without spreading it into arguments. */
function append<T>(to: T[], more: readonly T[]): void {
  for (const item of more) to.push(item);
}

/** (default) What weighing two paragraphs' words costs, in token steps, for the work bound. Safe range: 4-64. */
export const COMPARE_LIKENESS_COST = 16;

type Side = {
  readonly tokens: readonly (readonly CompareToken[])[];
  readonly keys: readonly string[];
  readonly words: readonly (ReadonlySet<string> | null)[];
};

function sideOf(tokens: readonly (readonly CompareToken[])[]): Side {
  return {
    tokens,
    keys: tokens.map((t) =>
      t[0]!.kind === 'start' ? `p${readingKey(t)}` : `b${(t[0] as { key: string }).key}`,
    ),
    words: tokens.map((t) => (t[0]!.kind === 'start' ? wordsOf(t) : null)),
  };
}

const tableOf = (tokens: readonly CompareToken[]): Table | null => {
  const first = tokens[0]!;
  return first.kind === 'block' && first.block.type === 'table' ? first.block : null;
};

/** The steps of a stretch read as one: tokens diffed. */
function stretchOps(p: readonly CompareToken[], s: readonly CompareToken[]): TokenOp[] {
  return diffSequences(p, s, sameToken, editsWithin(p.length + s.length)).map((op): TokenOp =>
    op.kind === 'same'
      ? { kind: 'same', p: p[op.a]!, s: s[op.b]! }
      : op.kind === 'delete'
        ? { kind: 'delete', p: p[op.a]! }
        : { kind: 'insert', s: s[op.b]! },
  );
}

/** Two paired blocks' steps: a paragraph's start kept and its words diffed, a block kept as a pair. */
const pairOps = (p: readonly CompareToken[], s: readonly CompareToken[]): TokenOp[] =>
  p[0]!.kind === 'start' && s[0]!.kind === 'start'
    ? [{ kind: 'same', p: p[0]!, s: s[0]! }, ...stretchOps(p.slice(1), s.slice(1))]
    : [{ kind: 'same', p: p[0]!, s: s[0]! }];

/** Walks a diff of block indexes (offset into the sides) into pairs and stretches. */
function walk(
  ops: readonly DiffOp[],
  pair: (a: number, b: number) => void,
  gap: (as: number[], bs: number[]) => void,
): void {
  let as: number[] = [];
  let bs: number[] = [];
  const flush = () => {
    if (as.length || bs.length) gap(as, bs);
    as = [];
    bs = [];
  };
  for (const op of ops) {
    if (op.kind === 'same') {
      flush();
      pair(op.a, op.b);
    } else if (op.kind === 'delete') as.push(op.a);
    else bs.push(op.b);
  }
  flush();
}

/** A stretch of blocks: alike ones paired, the rest read as one. */
function gapOps(p: Side, s: Side, as: readonly number[], bs: readonly number[]): TokenOp[] {
  const alike = (a: number, b: number): boolean => {
    const wa = p.words[a];
    const wb = s.words[b];
    if (wa && wb) return likeness(wa, wb) >= COMPARE_SIMILAR_PARAGRAPHS;
    const ta = tableOf(p.tokens[a]!);
    const tb = tableOf(s.tokens[b]!);
    if (ta && tb) return true;
    return p.keys[a] === s.keys[b];
  };
  const out: TokenOp[] = [];
  // Weighing two paragraphs' words costs about as much as this many token steps, so the search is bounded alike.
  const diff = diffSequences(
    as,
    bs,
    alike,
    editsWithin((as.length + bs.length) * COMPARE_LIKENESS_COST),
  );
  walk(
    diff.map((op): DiffOp =>
      op.kind === 'same'
        ? { kind: 'same', a: as[op.a]!, b: bs[op.b]! }
        : op.kind === 'delete'
          ? { kind: 'delete', a: as[op.a]! }
          : { kind: 'insert', b: bs[op.b]! },
    ),
    (a, b) => append(out, pairOps(p.tokens[a]!, s.tokens[b]!)),
    (ga, gb) =>
      append(
        out,
        stretchOps(
          ga.flatMap((a) => p.tokens[a]!),
          gb.flatMap((b) => s.tokens[b]!),
        ),
      ),
  );
  return out;
}

/** The comparison of two containers' blocks: the primary's with the differences from the selected's suggested. */
export function compareBlocks(
  primary: readonly Block[],
  selected: readonly Block[],
  ctx: CompareContext,
): Block[] {
  const pt = tokensOf(primary);
  const st = tokensOf(selected);
  const p = sideOf(pt.blocks);
  const s = sideOf(st.blocks);
  const ops: TokenOp[] = [];
  // The first paragraphs of both always pair: a container's first paragraph has no paragraph before it to join.
  const pinned = primary[0]?.type === 'paragraph' && selected[0]?.type === 'paragraph' ? 1 : 0;
  if (pinned) append(ops, pairOps(p.tokens[0]!, s.tokens[0]!));
  const same = (a: string, b: string) => a === b;
  const pk = p.keys.slice(pinned);
  const sk = s.keys.slice(pinned);
  walk(
    diffSequences(pk, sk, same, editsWithin(pk.length + sk.length)).map((op): DiffOp =>
      op.kind === 'same'
        ? { kind: 'same', a: op.a + pinned, b: op.b + pinned }
        : op.kind === 'delete'
          ? { kind: 'delete', a: op.a + pinned }
          : { kind: 'insert', b: op.b + pinned },
    ),
    (a, b) => append(ops, pairOps(p.tokens[a]!, s.tokens[b]!)),
    (as, bs) => append(ops, gapOps(p, s, as, bs)),
  );
  return buildBlocks(ops, st.trailing, ctx);
}

const rowKey = (row: TableRow): string => stableKey(row.cells.map((c) => c.blocks));

/** Whether two rows' cells line up: as many, each spanning as many columns and rows. */
const linedUp = (a: TableRow, b: TableRow): boolean =>
  a.cells.length === b.cells.length &&
  a.cells.every(
    (c, k) =>
      (c.colSpan ?? 1) === (b.cells[k]!.colSpan ?? 1) &&
      (c.rowSpan ?? 1) === (b.cells[k]!.rowSpan ?? 1),
  );

/**
 * Two paired tables compared: with as many columns, row by row, rows that line up compared cell by cell and the rest
 * suggested inserted or deleted; else the primary's deleted and the selected's inserted. The primary's widths and
 * formatting are kept.
 */
export function compareTables(primary: Table, selected: Table, ctx: CompareContext): Block[] {
  const { suggested: _p, ...p } = primary;
  const { suggested: _s, ...s } = selected;
  if (p.columns.length !== s.columns.length) {
    const mark = ctx.mark();
    return [
      { ...p, suggested: { deletion: mark } },
      { ...s, suggested: { insertion: mark } },
    ];
  }
  const rows: TableRow[] = [];
  const compared = (a: TableRow, b: TableRow): TableRow => ({
    ...a,
    cells: a.cells.map((cell, k): TableCell => ({
      ...cell,
      blocks: compareBlocks(cell.blocks, b.cells[k]!.blocks, ctx),
    })),
  });
  const pr = p.rows.map(rowKey);
  const sr = s.rows.map(rowKey);
  const replace = (as: readonly number[], bs: readonly number[]) => {
    let mark: ReturnType<CompareContext['mark']> | null = null;
    const once = () => (mark ??= ctx.mark());
    const deleted: TableRow[] = [];
    const inserted: TableRow[] = [];
    for (let k = 0; k < Math.max(as.length, bs.length); k++) {
      const a = as[k] === undefined ? undefined : p.rows[as[k]!]!;
      const b = bs[k] === undefined ? undefined : s.rows[bs[k]!]!;
      if (a && b && linedUp(a, b)) {
        rows.push(...deleted.splice(0), ...inserted.splice(0), compared(a, b));
        continue;
      }
      if (a) deleted.push({ ...a, suggested: { deletion: once() } });
      if (b) inserted.push({ ...b, suggested: { insertion: once() } });
    }
    rows.push(...deleted, ...inserted);
  };
  walk(
    diffSequences(pr, sr, (a, b) => a === b, editsWithin(pr.length + sr.length)),
    (a, b) => replace([a], [b]),
    replace,
  );
  return [{ ...p, rows }];
}
