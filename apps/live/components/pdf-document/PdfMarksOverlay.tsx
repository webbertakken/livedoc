// LiveDoc's marks over a page's picture (docs/specs/035-pdf-documents/marks.md "Making a mark"): each mark's quads,
// placed through the matrix the page was drawn with, multiplied onto the page so the words under a highlight keep
// their own colour. Geometry LiveDoc draws itself, never markup of the file. The page and its thumbnail share it.
import type { Mark, PageMatrix, Quad } from '@livedoc/pdf-documents';
import { PageView } from '@livedoc/pdf-documents';

/** A quad as an SVG polygon's points, in view space. */
export const pointsOf = (matrix: PageMatrix, quad: Quad): string =>
  // The standard orders a quad upper left, upper right, lower left, lower right: around its edge is 0, 1, 3, 2.
  [0, 1, 3, 2]
    .map((corner) => PageView.quadToView(matrix, quad)[corner]!)
    .map(({ x, y }) => `${x},${y}`)
    .join(' ');

export function PdfMarksOverlay({
  matrix,
  width,
  height,
  marks,
  preview = [],
  selected = [],
}: {
  // Page space to view space, as the picture under it was drawn.
  matrix: PageMatrix;
  // The page as it shows, in points: the overlay's view box.
  width: number;
  height: number;
  marks: readonly Mark[];
  // The text a drag would mark, drawn while the drag lasts.
  preview?: readonly Quad[];
  // The text selected on the page, in the shell's focus colour (reading-surface.md "The pages": Selecting text).
  selected?: readonly Quad[];
}) {
  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 h-full w-full mix-blend-multiply"
    >
      {marks.map((mark) => (
        <g
          key={mark.id}
          data-pdf-mark={mark.id}
          data-pdf-mark-kind={mark.kind}
          fill={mark.colour}
          opacity={mark.opacity}
        >
          {mark.quads.map((quad, at) => (
            <polygon key={at} points={pointsOf(matrix, quad)} />
          ))}
        </g>
      ))}
      {selected.length > 0 ? (
        <g data-pdf-text-selection="true" className="fill-(--office-focus)" opacity={0.35}>
          {selected.map((quad, at) => (
            <polygon key={at} points={pointsOf(matrix, quad)} />
          ))}
        </g>
      ) : null}
      {preview.length > 0 ? (
        <g data-pdf-mark-preview="true" fill="#bae6fd">
          {preview.map((quad, at) => (
            <polygon key={at} points={pointsOf(matrix, quad)} />
          ))}
        </g>
      ) : null}
    </svg>
  );
}
