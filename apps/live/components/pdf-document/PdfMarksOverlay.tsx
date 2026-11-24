// LiveDoc's marks over a page's picture (docs/specs/035-pdf-documents/marks.md "Making a mark"): each mark's quads,
// placed through the matrix the page was drawn with, multiplied onto the page so the words under a highlight keep
// their own colour. Geometry LiveDoc draws itself, never markup of the file. The page and its thumbnail share it.
// Under Dark pages (dark-pages.md "The recolouring") a mark takes the colour the step gives the file's own marks, and
// lightens the dark page as multiplying darkens the white one, so the words under it keep their ink.
import { useContext } from 'react';
import type { Mark, MarkShape, PageMatrix, PagePoint, Quad } from '@livedoc/pdf-documents';
import { DarkPages, MarkDrawing, PageView } from '@livedoc/pdf-documents';
import { PdfLookContext } from '@/lib/pdf-document/pdf-look';
import type { PdfFindTints } from '@/lib/pdf-document/usePdfFind';

/** A quad as an SVG polygon's points, in view space. */
export const pointsOf = (matrix: PageMatrix, quad: Quad): string =>
  // The standard orders a quad upper left, upper right, lower left, lower right: around its edge is 0, 1, 3, 2.
  [0, 1, 3, 2]
    .map((corner) => PageView.quadToView(matrix, quad)[corner]!)
    .map(({ x, y }) => `${x},${y}`)
    .join(' ');

/** Points of page space as an SVG list's, in view space. */
const viewPoints = (matrix: PageMatrix, points: readonly PagePoint[]): string =>
  points
    .map((point) => PageView.toView(matrix, point))
    .map(({ x, y }) => `${x},${y}`)
    .join(' ');

/** What a mark draws, as SVG in view space: its fills, then its lines, a closed line a polygon. */
function MarkShapes({ matrix, shape }: { matrix: PageMatrix; shape: MarkShape }) {
  const { fills, strokes } = MarkDrawing.of(shape);
  return (
    <>
      {fills.map((points, at) => (
        <polygon key={`f${at}`} stroke="none" points={viewPoints(matrix, points)} />
      ))}
      {strokes.map((stroke, at) => {
        const look = {
          points: viewPoints(matrix, stroke.points),
          strokeWidth: stroke.width,
          strokeLinecap: stroke.round ? ('round' as const) : undefined,
          strokeLinejoin: stroke.round ? ('round' as const) : undefined,
        };
        return stroke.closed ? (
          <polygon key={`s${at}`} fill="none" {...look} />
        ) : (
          <polyline key={`s${at}`} fill="none" {...look} />
        );
      })}
    </>
  );
}

export function PdfMarksOverlay({
  matrix,
  width,
  height,
  marks,
  preview = [],
  draft = null,
  selected = [],
  found = null,
}: {
  // Page space to view space, as the picture under it was drawn.
  matrix: PageMatrix;
  // The page as it shows, in points: the overlay's view box.
  width: number;
  height: number;
  marks: readonly Mark[];
  // The text a drag would mark, drawn while the drag lasts.
  preview?: readonly Quad[];
  // The mark being drawn or dragged (a Drawing's stroke, a line, a shape), in its tool's look.
  draft?: { shape: MarkShape; colour: string; opacity: number } | null;
  // The text selected on the page, in the shell's focus colour (reading-surface.md "The pages": Selecting text).
  selected?: readonly Quad[];
  // Find's results on the page, the current one stronger (reading-surface.md "Find").
  found?: PdfFindTints | null;
}) {
  const dark = useContext(PdfLookContext) === 'dark';
  return (
    <svg
      data-pdf-look={dark ? 'dark' : 'paper'}
      aria-hidden="true"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={`pointer-events-none absolute inset-0 h-full w-full ${dark ? 'mix-blend-lighten' : 'mix-blend-multiply'}`}
    >
      {marks.map((mark) => {
        const colour = dark ? DarkPages.hex(mark.colour) : mark.colour;
        return (
          <g
            key={mark.id}
            data-pdf-mark={mark.id}
            data-pdf-mark-kind={mark.kind}
            fill={colour}
            stroke={colour}
            opacity={mark.opacity}
          >
            <MarkShapes matrix={matrix} shape={mark} />
          </g>
        );
      })}
      {found && found.found.length > 0 ? (
        <g data-pdf-found="true" className="fill-(--pdf-found)" opacity={0.6}>
          {found.found.map((quad, at) => (
            <polygon key={at} points={pointsOf(matrix, quad)} />
          ))}
        </g>
      ) : null}
      {found && found.current.length > 0 ? (
        <g data-pdf-found-current="true" className="fill-(--pdf-found-current)" opacity={0.6}>
          {found.current.map((quad, at) => (
            <polygon key={at} points={pointsOf(matrix, quad)} />
          ))}
        </g>
      ) : null}
      {selected.length > 0 ? (
        <g data-pdf-text-selection="true" className="fill-(--office-focus)" opacity={0.35}>
          {selected.map((quad, at) => (
            <polygon key={at} points={pointsOf(matrix, quad)} />
          ))}
        </g>
      ) : null}
      {draft ? (
        <g
          data-pdf-draft={draft.shape.kind}
          fill={dark ? DarkPages.hex(draft.colour) : draft.colour}
          stroke={dark ? DarkPages.hex(draft.colour) : draft.colour}
          opacity={draft.opacity}
        >
          <MarkShapes matrix={matrix} shape={draft.shape} />
        </g>
      ) : null}
      {preview.length > 0 ? (
        <g data-pdf-mark-preview="true" className="fill-(--pdf-mark-preview)">
          {preview.map((quad, at) => (
            <polygon key={at} points={pointsOf(matrix, quad)} />
          ))}
        </g>
      ) : null}
    </svg>
  );
}
