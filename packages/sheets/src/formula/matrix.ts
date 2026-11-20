// Matrices and least squares (docs/specs/029-sheets/formulas.md "Functions": Arrays): the pure arithmetic under
// MMULT, MDETERM, MINVERSE, LINEST, LOGEST, TREND and GROWTH. A matrix is its rows, at least one, every row as long.

export type Matrix = readonly (readonly number[])[];

/** A least-squares fit of y on the columns of a design matrix. */
export type LeastSquaresFit = {
  // One coefficient per design column.
  readonly coefficients: readonly number[];
  // (XᵀX)⁻¹, whose diagonal times the residual variance is each coefficient's variance.
  readonly inverseGram: Matrix;
  // The sum of the squared residuals.
  readonly residualSquares: number;
};

// A pivot this small beside the matrix's largest entry is taken as zero: the matrix is singular, or its columns
// collinear. Floating point leaves about 1e-16 of an exact zero; 1e-12 leaves room for the steps before it.
export const SINGULAR_TOLERANCE = 1e-12;

function largestEntry(a: Matrix): number {
  let m = 0;
  for (const row of a) for (const x of row) m = Math.max(m, Math.abs(x));
  return m;
}

function copy(a: Matrix): number[][] {
  return a.map((row) => [...row]);
}

function multiply(a: Matrix, b: Matrix): number[][] {
  const inner = b.length;
  const cols = b[0]!.length;
  return a.map((row) => {
    const out = new Array<number>(cols).fill(0);
    for (let k = 0; k < inner; k++) {
      const x = row[k]!;
      const bk = b[k]!;
      for (let j = 0; j < cols; j++) out[j]! += x * bk[j]!;
    }
    return out;
  });
}

function transpose(a: Matrix): number[][] {
  const cols = a[0]!.length;
  return Array.from({ length: cols }, (_, j) => a.map((row) => row[j]!));
}

// The row at or below `from` whose entry in column `col` is largest (partial pivoting).
function pivotRow(a: number[][], col: number, from: number): number {
  let best = from;
  for (let i = from + 1; i < a.length; i++)
    if (Math.abs(a[i]![col]!) > Math.abs(a[best]![col]!)) best = i;
  return best;
}

// Gaussian elimination with partial pivoting: the product of the pivots, signed by the swaps.
function determinant(a: Matrix): number {
  const m = copy(a);
  const n = m.length;
  let det = 1;
  for (let col = 0; col < n; col++) {
    const p = pivotRow(m, col, col);
    if (m[p]![col] === 0) return 0;
    if (p !== col) {
      [m[p], m[col]] = [m[col]!, m[p]!];
      det = -det;
    }
    const pivot = m[col]![col]!;
    det *= pivot;
    for (let i = col + 1; i < n; i++) {
      const factor = m[i]![col]! / pivot;
      for (let j = col; j < n; j++) m[i]![j]! -= factor * m[col]![j]!;
    }
  }
  return det;
}

// Gauss-Jordan elimination with partial pivoting; null when the matrix is singular.
function inverse(a: Matrix): number[][] | null {
  const n = a.length;
  const scale = largestEntry(a);
  const m = a.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let col = 0; col < n; col++) {
    const p = pivotRow(m, col, col);
    if (Math.abs(m[p]![col]!) <= SINGULAR_TOLERANCE * scale) return null;
    [m[p], m[col]] = [m[col]!, m[p]!];
    const pivot = m[col]![col]!;
    for (let j = 0; j < 2 * n; j++) m[col]![j]! /= pivot;
    for (let i = 0; i < n; i++) {
      if (i === col) continue;
      const factor = m[i]![col]!;
      if (factor === 0) continue;
      for (let j = 0; j < 2 * n; j++) m[i]![j]! -= factor * m[col]![j]!;
    }
  }
  return m.map((row) => row.slice(n));
}

// The inverse of an upper triangular matrix with a non-zero diagonal, by back substitution.
function upperInverse(r: number[][]): number[][] {
  const p = r.length;
  const out = Array.from({ length: p }, () => new Array<number>(p).fill(0));
  for (let j = 0; j < p; j++) {
    out[j]![j] = 1 / r[j]![j]!;
    for (let i = j - 1; i >= 0; i--) {
      let s = 0;
      for (let k = i + 1; k <= j; k++) s += r[i]![k]! * out[k]![j]!;
      out[i]![j] = -s / r[i]![i]!;
    }
  }
  return out;
}

// Least squares by Householder QR, for its accuracy over the normal equations: x is n rows of p design values.
// Null when a design column is a combination of the others (collinear) or there are fewer rows than columns.
function leastSquares(x: Matrix, y: readonly number[]): LeastSquaresFit | null {
  const n = x.length;
  const p = x[0]!.length;
  if (n < p) return null;
  const a = copy(x);
  const b = [...y];
  const scale = largestEntry(x);
  for (let col = 0; col < p; col++) {
    let norm = 0;
    for (let i = col; i < n; i++) norm += a[i]![col]! ** 2;
    norm = Math.sqrt(norm);
    if (norm <= SINGULAR_TOLERANCE * scale) return null;
    const alpha = a[col]![col]! > 0 ? -norm : norm;
    const v = Array.from({ length: n - col }, (_, k) => a[col + k]![col]!);
    v[0]! -= alpha;
    let vv = 0;
    for (const t of v) vv += t * t;
    const reflect = (get: (i: number) => number, set: (i: number, t: number) => void) => {
      let dot = 0;
      for (let k = 0; k < v.length; k++) dot += v[k]! * get(col + k);
      const f = (2 * dot) / vv;
      for (let k = 0; k < v.length; k++) set(col + k, get(col + k) - f * v[k]!);
    };
    for (let j = col; j < p; j++)
      reflect(
        (i) => a[i]![j]!,
        (i, t) => {
          a[i]![j] = t;
        },
      );
    reflect(
      (i) => b[i]!,
      (i, t) => {
        b[i] = t;
      },
    );
  }
  const r = a.slice(0, p).map((row) => row.slice(0, p));
  const rInverse = upperInverse(r);
  const qtb = b.slice(0, p);
  const coefficients = rInverse.map((row) => row.reduce((s, t, k) => s + t * qtb[k]!, 0));
  let residualSquares = 0;
  for (let i = p; i < n; i++) residualSquares += b[i]! ** 2;
  return { coefficients, inverseGram: multiply(rInverse, transpose(rInverse)), residualSquares };
}

export const Matrices = { multiply, transpose, determinant, inverse, leastSquares } as const;
