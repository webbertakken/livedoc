// Between page space and view space (docs/specs/035-pdf-documents/marks.md "Making a mark": a mark is made on the
// page as the file has it, whatever the view): a page's matrix applied and inverted. Pure geometry.
import type { PageMatrix, PagePoint } from './engine-contract';
import type { Quad } from './mark';

export const PageView = {
  /** A point of page space in view space. */
  toView: ([a, b, c, d, e, f]: PageMatrix, { x, y }: PagePoint): PagePoint => ({
    x: a * x + c * y + e,
    y: b * x + d * y + f,
  }),
  /** A point of view space in page space, or null for a matrix that cannot be inverted. */
  toPage: ([a, b, c, d, e, f]: PageMatrix, { x, y }: PagePoint): PagePoint | null => {
    const det = a * d - b * c;
    if (det === 0 || !Number.isFinite(det)) return null;
    return { x: (d * (x - e) - c * (y - f)) / det, y: (a * (y - f) - b * (x - e)) / det };
  },
  /** A quad's four corners in view space, in the quad's own order. */
  quadToView: (matrix: PageMatrix, quad: Quad): readonly PagePoint[] =>
    [0, 2, 4, 6].map((at) => PageView.toView(matrix, { x: quad[at]!, y: quad[at + 1]! })),
} as const;
