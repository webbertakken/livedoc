// The longest common reading of two sequences (review.md "Compare documents", "What is compared", "Bounded"): Myers'
// O((N+M)D) greedy diff after the common start and end are trimmed, bounded by a number of edits past which the rest
// reads as wholly deleted and inserted. Pure and generic: the comparison runs it on blocks and on words.

/** One step of a diff: an element of both (`a` and `b`), of the first only (`a`), or of the second only (`b`). */
export type DiffOp =
  | { readonly kind: 'same'; readonly a: number; readonly b: number }
  | { readonly kind: 'delete'; readonly a: number; readonly b?: undefined }
  | { readonly kind: 'insert'; readonly b: number; readonly a?: undefined };

/** The most edits one comparison searches for in a stretch (review.md "Bounded", (default)). Safe range: 500-20,000. */
export const TEXT_DOCUMENT_COMPARE_EDITS_MAX = 2_000;
/**
 * The most steps one search makes, its length times its edits (review.md "Bounded", (default)): a longer stretch
 * searches for fewer edits, so no stretch costs more. Safe range: 1M-100M.
 */
export const TEXT_DOCUMENT_COMPARE_WORK_MAX = 20_000_000;

/** How many edits a search over `length` elements may look for, within the work bound. */
export const editsWithin = (length: number): number =>
  Math.max(
    16,
    Math.min(
      TEXT_DOCUMENT_COMPARE_EDITS_MAX,
      Math.floor(TEXT_DOCUMENT_COMPARE_WORK_MAX / Math.max(1, length)),
    ),
  );

/** Deletions before insertions, as a stretch of differences reads. */
function stretch(ops: DiffOp[], aFrom: number, aTo: number, bFrom: number, bTo: number): void {
  for (let a = aFrom; a < aTo; a++) ops.push({ kind: 'delete', a });
  for (let b = bFrom; b < bTo; b++) ops.push({ kind: 'insert', b });
}

/** The furthest-reaching paths of each number of edits, or null when more than `maxEdits` are needed. */
function search<T>(
  a: readonly T[],
  b: readonly T[],
  aFrom: number,
  bFrom: number,
  n: number,
  m: number,
  same: (x: T, y: T) => boolean,
  maxEdits: number,
): Int32Array[] | null {
  const offset = maxEdits + 1;
  const v = new Int32Array(2 * offset + 1);
  const trace: Int32Array[] = [];
  for (let d = 0; d <= maxEdits; d++) {
    for (let k = -d; k <= d; k += 2) {
      let x =
        k === -d || (k !== d && v[offset + k - 1]! < v[offset + k + 1]!)
          ? v[offset + k + 1]!
          : v[offset + k - 1]! + 1;
      let y = x - k;
      while (x < n && y < m && same(a[aFrom + x]!, b[bFrom + y]!)) {
        x++;
        y++;
      }
      v[offset + k] = x;
      if (x >= n && y >= m) {
        trace.push(v.slice(offset - d, offset + d + 1));
        return trace;
      }
    }
    trace.push(v.slice(offset - d, offset + d + 1));
  }
  return null;
}

/** Walks the paths back from the end into steps, each stretch's deletions before its insertions. */
function backtrack(
  trace: Int32Array[],
  aFrom: number,
  bFrom: number,
  n: number,
  m: number,
): DiffOp[] {
  const steps: DiffOp[] = [];
  let x = n;
  let y = m;
  for (let d = trace.length - 1; d > 0; d--) {
    const previous = trace[d - 1]!;
    const at = (k: number) => previous[k + d - 1]!;
    const k = x - y;
    const down = k === -d || (k !== d && at(k - 1) < at(k + 1));
    const prevK = down ? k + 1 : k - 1;
    const prevX = at(prevK);
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) steps.push({ kind: 'same', a: aFrom + --x, b: bFrom + --y });
    if (down) steps.push({ kind: 'insert', b: bFrom + --y });
    else steps.push({ kind: 'delete', a: aFrom + --x });
  }
  while (x > 0 && y > 0) steps.push({ kind: 'same', a: aFrom + --x, b: bFrom + --y });
  steps.reverse();
  return orderStretches(steps);
}

/** Within each stretch between sames, the deletions first. */
function orderStretches(steps: readonly DiffOp[]): DiffOp[] {
  const ordered: DiffOp[] = [];
  let deletes: DiffOp[] = [];
  let inserts: DiffOp[] = [];
  const flush = () => {
    for (const op of deletes) ordered.push(op);
    for (const op of inserts) ordered.push(op);
    deletes = [];
    inserts = [];
  };
  for (const step of steps) {
    if (step.kind === 'same') {
      flush();
      ordered.push(step);
    } else (step.kind === 'delete' ? deletes : inserts).push(step);
  }
  flush();
  return ordered;
}

/**
 * The steps that read `a` as `b`, keeping their longest common reading under `same`; past `maxEdits` edits, the part
 * between the common start and end is deleted and inserted whole.
 */
export function diffSequences<T>(
  a: readonly T[],
  b: readonly T[],
  same: (x: T, y: T) => boolean,
  maxEdits: number,
): DiffOp[] {
  let start = 0;
  while (start < a.length && start < b.length && same(a[start]!, b[start]!)) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && same(a[endA - 1]!, b[endB - 1]!)) {
    endA--;
    endB--;
  }
  const ops: DiffOp[] = [];
  for (let i = 0; i < start; i++) ops.push({ kind: 'same', a: i, b: i });
  const n = endA - start;
  const m = endB - start;
  if (n === 0 || m === 0) stretch(ops, start, endA, start, endB);
  else {
    const trace = search(a, b, start, start, n, m, same, maxEdits);
    if (trace) for (const op of backtrack(trace, start, start, n, m)) ops.push(op);
    else stretch(ops, start, endA, start, endB);
  }
  for (let i = 0; i < a.length - endA; i++) ops.push({ kind: 'same', a: endA + i, b: endB + i });
  return ops;
}
