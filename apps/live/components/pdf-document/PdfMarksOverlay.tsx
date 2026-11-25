// LiveDoc's marks over a page's picture (docs/specs/035-pdf-documents/marks.md "Making a mark"): each mark's quads,
// placed through the matrix the page was drawn with, multiplied onto the page so the words under a highlight keep
// their own colour. Geometry LiveDoc draws itself, never markup of the file. The page and its thumbnail share it.
// Under Dark pages (dark-pages.md "The recolouring") a mark takes the colour the step gives the file's own marks, and
// lightens the dark page as multiplying darkens the white one, so the words under it keep their ink. A Text's, a
// Callout's and a stamp's words are set line for line as MarkWords places them, in a face with Helvetica's widths,
// a stamp's name bold; or in the mark faces, as shaped (marks.md "Words in every script"). A selected mark is
// outlined in the shell's focus colour, and marks being dragged are drawn where the drag has them ("Changing a mark").
import { useContext, useEffect } from 'react';
import type { MarkShape, PageMatrix, PagePoint, Quad } from '@livedoc/pdf-documents';
import {
  DarkPages,
  Helvetica,
  Mark,
  MarkDrawing,
  MarkPlace,
  MarkWords,
  PageView,
} from '@livedoc/pdf-documents';
import { PdfLookContext } from '@/lib/pdf-document/pdf-look';
import { addMarkFaces, facesStackOf } from '@/lib/pdf-document/pdf-mark-faces';
import type { PdfFindTints } from '@/lib/pdf-document/usePdfFind';
import type { PdfMarksMoving } from '@/lib/pdf-document/usePdfPageMarkPress';

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

/** Whether Helvetica writes every character of a line, so it is held to Helvetica's width exactly. */
const helveticas = (text: string): boolean =>
  Array.from(text).every((character) => Helvetica.writes(character.codePointAt(0)!));

/**
 * A mark's words as SVG in view space: each line set from its baseline, along the page's own across and
 * down as the matrix turns them, held to the width the file sets it at where Helvetica writes it; a mark in the mark
 * faces drawn in them as shaped, from its own side.
 */
export function PdfMarkWords({ matrix, mark }: { matrix: PageMatrix; mark: Mark }) {
  const words = MarkWords.of(mark);
  const region = words?.faces === 'noto' ? words.region : null;
  const faced = region !== null;
  useEffect(() => {
    if (region) void addMarkFaces(region);
  }, [region]);
  if (!words) return null;
  const [a, b, c, d] = matrix;
  return (
    <g
      stroke="none"
      fontFamily={facesStackOf(words)}
      style={{ whiteSpace: 'pre', ...(faced ? { fontSynthesis: 'none' } : {}) }}
    >
      {words.lines.map((line, at) => {
        if (line.text === '') return null;
        // A right-to-left line is set from its right end.
        const start = PageView.toView(matrix, {
          x: line.rtl ? line.x + line.width : line.x,
          y: line.y,
        });
        const held = !faced && !line.rtl && helveticas(line.text);
        return (
          <text
            key={at}
            transform={`matrix(${a} ${b} ${-c} ${-d} ${start.x} ${start.y})`}
            fontSize={line.size}
            fontWeight={line.bold ? 'bold' : undefined}
            direction={line.rtl ? 'rtl' : undefined}
            textLength={held ? line.width : undefined}
            lengthAdjust={held ? 'spacingAndGlyphs' : undefined}
          >
            {line.text}
          </text>
        );
      })}
    </g>
  );
}

/** What a mark draws, as SVG in view space: a shape's fill in its own colour (stepped on Dark pages), its fills, then
 *  its lines, a closed line a polygon, a styled line dashed by its pattern. */
export function MarkShapes({
  matrix,
  shape,
  dark = false,
}: {
  matrix: PageMatrix;
  shape: MarkShape;
  dark?: boolean;
}) {
  const { fills, strokes, fill } = MarkDrawing.of(shape);
  return (
    <>
      {fill ? (
        <polygon
          stroke="none"
          fill={dark ? DarkPages.hex(fill.colour) : fill.colour}
          points={viewPoints(matrix, fill.points)}
        />
      ) : null}
      {fills.map((points, at) => (
        <polygon key={`f${at}`} stroke="none" points={viewPoints(matrix, points)} />
      ))}
      {strokes.map((stroke, at) => {
        const look = {
          points: viewPoints(matrix, stroke.points),
          strokeWidth: stroke.width,
          strokeLinecap: stroke.round ? ('round' as const) : undefined,
          strokeLinejoin: stroke.round ? ('round' as const) : undefined,
          strokeDasharray: stroke.dash?.join(' '),
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

/** A mark being resized, and its geometry as the handle's drag has it. */
export type PdfMarkReshaping = { readonly id: string; readonly place: MarkPlace };

/** A mark where a drag has it: moved by the drag's offset while among the marks dragged, or resized by a handle. */
/** No mark of the file's own. */
const NO_IDS: ReadonlySet<string> = new Set();

/** Whether a mark is being dragged or resized now. */
const inHand = (id: string, moving: PdfMarksMoving | null, reshaping: PdfMarkReshaping | null) =>
  reshaping?.id === id || moving?.ids.includes(id) === true;

function placed(
  mark: Mark,
  moving: PdfMarksMoving | null,
  reshaping: PdfMarkReshaping | null,
): Mark {
  if (reshaping?.id === mark.id) return { ...mark, ...reshaping.place };
  return moving?.ids.includes(mark.id) ? { ...mark, ...MarkPlace.moved(mark, moving.by) } : mark;
}

/** The outline round a selected mark, in view space: the box holding it and its line, `gap` points out. */
function MarkOutline({ matrix, mark, gap }: { matrix: PageMatrix; mark: Mark; gap: number }) {
  const [left, bottom, right, top] = Mark.bounds(mark);
  const out = gap + ('width' in mark ? mark.width / 2 : 0);
  const corners = [
    { x: left - out, y: bottom - out },
    { x: right + out, y: top + out },
  ].map((corner) => PageView.toView(matrix, corner));
  const xs = corners.map((corner) => corner.x);
  const ys = corners.map((corner) => corner.y);
  return (
    <rect
      data-pdf-mark-outline={mark.id}
      x={Math.min(...xs)}
      y={Math.min(...ys)}
      width={Math.abs(xs[1]! - xs[0]!)}
      height={Math.abs(ys[1]! - ys[0]!)}
      fill="none"
      strokeWidth={1.5}
      strokeDasharray="4 3"
      vectorEffect="non-scaling-stroke"
    />
  );
}

export function PdfMarksOverlay({
  matrix,
  width,
  height,
  marks,
  fileOwn = NO_IDS,
  preview = [],
  draft = null,
  selected = [],
  found = null,
  chosen = [],
  outline = 0,
  moving = null,
  reshaping = null,
}: {
  // Page space to view space, as the picture under it was drawn.
  matrix: PageMatrix;
  // The page as it shows, in points: the overlay's view box.
  width: number;
  height: number;
  marks: readonly Mark[];
  // The marks of the file's own among them: the picture draws them, so they are drawn here only while dragged, and
  // outlined while selected (marks.md "Changing a mark").
  fileOwn?: ReadonlySet<string>;
  // The text a drag would mark, drawn while the drag lasts.
  preview?: readonly Quad[];
  // The mark being drawn or dragged (a Drawing's stroke, a line, a shape), in its tool's look.
  draft?: { shape: MarkShape; colour: string; opacity: number } | null;
  // The text selected on the page, in the shell's focus colour (reading-surface.md "The pages": Selecting text).
  selected?: readonly Quad[];
  // Find's results on the page, the current one stronger (reading-surface.md "Find").
  found?: PdfFindTints | null;
  // The marks selected, outlined `outline` points out from them (marks.md "Changing a mark").
  chosen?: readonly string[];
  outline?: number;
  // The marks being dragged, and how far.
  moving?: PdfMarksMoving | null;
  // The mark being resized by a handle, as the drag has it.
  reshaping?: PdfMarkReshaping | null;
}) {
  const shown = moving || reshaping ? marks.map((mark) => placed(mark, moving, reshaping)) : marks;
  const dark = useContext(PdfLookContext) === 'dark';
  return (
    <svg
      data-pdf-look={dark ? 'dark' : 'paper'}
      aria-hidden="true"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={`pointer-events-none absolute inset-0 h-full w-full ${dark ? 'mix-blend-lighten' : 'mix-blend-multiply'}`}
    >
      {shown
        .filter((mark) => !fileOwn.has(mark.id) || inHand(mark.id, moving, reshaping))
        .map((mark) => {
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
              <MarkShapes matrix={matrix} shape={mark} dark={dark} />
              <PdfMarkWords matrix={matrix} mark={mark} />
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
      {chosen.length > 0 ? (
        <g data-pdf-mark-outlines="true" className="stroke-(--office-focus)">
          {shown
            .filter((mark) => chosen.includes(mark.id))
            .map((mark) => (
              <MarkOutline key={mark.id} matrix={matrix} mark={mark} gap={outline} />
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
